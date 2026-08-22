import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const reactRewriteDirectory = path.join(projectRoot, "node_modules", "react-rewrite-cli");
const batchTransformPath = path.join(reactRewriteDirectory, "dist", "batch-transform.js");
const cliPath = path.join(reactRewriteDirectory, "bin", "react-rewrite.js");
const compatibilityMarker = "test4test-react-rewrite-text-source-fallback";

const replacementTextResolver = `/** Test4Test compatibility: ${compatibilityMarker}
 * React 19 can report the source of a design-system wrapper instead of the
 * literal JSX child that owns edited text. Build one normalized static-text
 * value per element so text split across JSX lines can still be matched. */
function getStaticJSXText(node) {
    const chunks = [];
    const visit = (child) => {
        if (child.type === "JSXText") {
            chunks.push(child.value);
            return;
        }
        if (child.type === "JSXElement") {
            for (const nestedChild of child.children ?? [])
                visit(nestedChild);
            return;
        }
        if (child.type !== "JSXExpressionContainer")
            return;
        const expression = child.expression;
        if ((expression.type === "StringLiteral" || expression.type === "Literal") &&
            typeof expression.value === "string") {
            chunks.push(expression.value);
            return;
        }
        if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
            chunks.push(expression.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(""));
        }
    };
    for (const child of node.children ?? [])
        visit(child);
    return normalizeWs(chunks.join(" ").trim());
}
function containsText(node, text) {
    const normalized = normalizeWs(text.trim());
    return normalized.length > 0 && getStaticJSXText(node).includes(normalized);
}
const textSourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
function collectTextSourceFiles(directory) {
    if (!fs.existsSync(directory))
        return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTextSourceFiles(entryPath));
        }
        else if (entry.isFile() && textSourceExtensions.has(path.extname(entry.name))) {
            files.push(entryPath);
        }
    }
    return files;
}
function findTextOperationCandidates(op, projectRoot) {
    const candidates = [];
    const searchRoots = [path.join(projectRoot, "src"), path.join(projectRoot, "design-system")];
    for (const searchRoot of searchRoots) {
        for (const filePath of collectTextSourceFiles(searchRoot)) {
            let source;
            try {
                source = fs.readFileSync(filePath, "utf-8");
            }
            catch {
                continue;
            }
            // Avoid parsing most files for each edit while retaining support for
            // multiline JSX and encoded entities in the actual candidate file.
            const anchorWords = op.originalText.match(/[A-Za-z0-9]{4,}/g)?.slice(0, 4) ?? [];
            if (anchorWords.length > 0 && !anchorWords.every((word) => source.includes(word)))
                continue;
            try {
                const { j, root } = parseSource(source, filePath);
                root.find(j.JSXElement).forEach((candidate) => {
                    const astTag = getJSXTagName(candidate.node);
                    if (!astTag || !tagNameMatches(astTag, op.tagName) ||
                        !containsText(candidate.node, op.originalText))
                        return;
                    const location = candidate.node.openingElement?.loc?.start;
                    if (location) {
                        candidates.push({ filePath, line: location.line, col: location.column });
                    }
                });
            }
            catch {
                // A file that cannot be parsed is not a candidate for this edit.
            }
        }
    }
    return candidates;
}
function resolveTextOperationLocations(operations, projectRoot) {
    return operations.map((op) => {
        if (op.op !== "updateText" || !op.tagName || !op.originalText)
            return op;
        const candidates = findTextOperationCandidates(op, projectRoot);
        if (candidates.length !== 1) {
            logger.debug(\`[resolve:text-source] Kept reported source for <\${op.tagName}>; found \${candidates.length} literal candidates\`);
            return op;
        }
        const candidate = candidates[0];
        const file = path.relative(projectRoot, candidate.filePath).replaceAll(path.sep, "/");
        logger.debug(\`[resolve:text-source] <\${op.tagName}> \${op.file}:\${op.line}:\${op.col} → \${file}:\${candidate.line}:\${candidate.col}\`);
        return { ...op, file, line: candidate.line, col: candidate.col };
    });
}
`;

export function prepareReactRewrite() {
  if (!fs.existsSync(batchTransformPath) || !fs.existsSync(cliPath)) {
    throw new Error(
      "react-rewrite-cli is not installed. Run npm install before npm run dev:rewrite.",
    );
  }

  let source = fs.readFileSync(batchTransformPath, "utf8");
  if (source.includes(compatibilityMarker)) return false;

  const fsImport = 'import * as fs from "node:fs";';
  if (!source.includes(fsImport)) {
    throw new Error("Unsupported react-rewrite-cli build: fs import was not found.");
  }
  source = source.replace(fsImport, `${fsImport}\nimport * as path from "node:path";`);

  const containsTextStart = source.indexOf("function containsText(node, text) {");
  const nodeResolutionStart = source.indexOf("// ── Node resolution", containsTextStart);
  if (containsTextStart < 0 || nodeResolutionStart < 0) {
    throw new Error("Unsupported react-rewrite-cli build: text resolver was not found.");
  }
  source = `${source.slice(0, containsTextStart)}${replacementTextResolver}${source.slice(nodeResolutionStart)}`;

  const executeBatchStart = "export function executeBatch(operations, projectRoot) {\n";
  if (!source.includes(executeBatchStart)) {
    throw new Error("Unsupported react-rewrite-cli build: executeBatch was not found.");
  }
  source = source.replace(
    executeBatchStart,
    `${executeBatchStart}    operations = resolveTextOperationLocations(operations, projectRoot);\n`,
  );

  const beforeContentLine = "        const beforeContent = source;\n";
  if (!source.includes(beforeContentLine)) {
    throw new Error("Unsupported react-rewrite-cli build: source snapshot was not found.");
  }
  source = source.replace(
    beforeContentLine,
    `${beforeContentLine}        const lineEnding = source.includes("\\r\\n") ? "\\r\\n" : "\\n";\n`,
  );

  const serializeLine =
    "                const afterContent = root.toSource({ quote: quoteStyle });\n";
  if (!source.includes(serializeLine)) {
    throw new Error("Unsupported react-rewrite-cli build: serializer was not found.");
  }
  source = source.replace(
    serializeLine,
    "                const afterContent = root.toSource({ quote: quoteStyle }).replace(/\\r?\\n/g, lineEnding);\n",
  );

  fs.writeFileSync(batchTransformPath, source, "utf8");
  return true;
}

function runReactRewrite() {
  prepareReactRewrite();

  const child = spawn(
    process.execPath,
    ["--disable-warning=DEP0060", cliPath, "--verbose", ...process.argv.slice(2)],
    { cwd: projectRoot, stdio: "inherit" },
  );

  child.on("error", (error) => {
    console.error(`Unable to start ReactRewrite: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}

const isMainModule =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) runReactRewrite();
