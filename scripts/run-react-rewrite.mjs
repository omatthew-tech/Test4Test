import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const reactRewriteDirectory = path.join(projectRoot, "node_modules", "react-rewrite-cli");
const batchTransformPath = path.join(reactRewriteDirectory, "dist", "batch-transform.js");
const serverPath = path.join(reactRewriteDirectory, "dist", "server.js");
const cliPath = path.join(reactRewriteDirectory, "bin", "react-rewrite.js");
const compatibilityMarker = "test4test-react-rewrite-static-text-v2";
const legacyMarker = "test4test-react-rewrite-text-source-fallback";
const textHelpersImport = `/** Test4Test compatibility: ${compatibilityMarker} */
import { containsText, resolveTextOperationLocations, resolveStaticTextNode, mutateStaticTextLiteral } from "../../../scripts/react-rewrite-text-source.mjs";
`;

function replaceRequired(source, before, after, description) {
  if (!source.includes(before)) {
    throw new Error(`Unsupported react-rewrite-cli build: ${description} was not found.`);
  }
  return source.replace(before, after);
}

export function patchBatchTransform(source) {
  if (source.includes(compatibilityMarker)) return source;
  const legacy = source.includes(legacyMarker);
  const resolverStart = legacy
    ? source.indexOf("/** Test4Test compatibility:")
    : source.indexOf("function containsText(node, text) {");
  const resolverEnd = source.indexOf("// ── Node resolution", resolverStart);
  if (resolverStart < 0 || resolverEnd < 0) {
    throw new Error("Unsupported react-rewrite-cli build: text resolver was not found.");
  }
  source = source.slice(0, resolverStart) + textHelpersImport + source.slice(resolverEnd);
  if (legacy) source = source.replace('import * as path from "node:path";\n', "");

  if (!legacy) {
    const batchStart = "export function executeBatch(operations, projectRoot) {\n";
    source = replaceRequired(
      source,
      batchStart,
      batchStart + "    operations = resolveTextOperationLocations(operations, projectRoot);\n",
      "batch entry",
    );
    const snapshot = "        const beforeContent = source;\n";
    source = replaceRequired(
      source,
      snapshot,
      snapshot + '        const lineEnding = source.includes("\\r\\n") ? "\\r\\n" : "\\n";\n',
      "source snapshot",
    );
    source = replaceRequired(
      source,
      "                const afterContent = root.toSource({ quote: quoteStyle });\n",
      "                const afterContent = root.toSource({ quote: quoteStyle }).replace(/\\r?\\n/g, lineEnding);\n",
      "serializer",
    );
  }

  const exactMatch = "        // ── Step A: Try exact line:col match";
  source = replaceRequired(
    source,
    exactMatch,
    `        if (op.op === "updateText" && (op.test4testTextTarget || op.test4testTextError)) {
            const node = op.test4testTextError ? null : resolveStaticTextNode(j, root, op);
            resolved.push({ index, op, node, priority: 0,
                error: op.test4testTextError || (node ? undefined : "Static text changed since resolution; reload and retry.") });
            continue;
        }
` + exactMatch,
    "node resolution",
  );
  const textCase = '        case "updateText": {\n';
  source = replaceRequired(
    source,
    textCase,
    textCase +
      `            if (op.test4testTextTarget === "literal") {
                mutateStaticTextLiteral(j, node, op.newText);
                return undefined;
            }
`,
    "text mutation",
  );
  return source;
}

export function prepareReactRewrite() {
  if (!fs.existsSync(batchTransformPath) || !fs.existsSync(cliPath)) {
    throw new Error(
      "react-rewrite-cli is not installed. Run npm install before npm run dev:rewrite.",
    );
  }
  const source = fs.readFileSync(batchTransformPath, "utf8");
  const patched = patchBatchTransform(source);
  const server = fs.readFileSync(serverPath, "utf8");
  const errorMarker = "test4test-react-rewrite-batch-errors";
  const patchedServer = server.includes(errorMarker)
    ? server
    : replaceRequired(
        server,
        "                            success: allSuccess,\n",
        `                            success: allSuccess,
                            // ${errorMarker}: the overlay reads the top-level error.
                            error: allSuccess ? undefined : batchResult.results.filter(r => !r.success).map(r => r.error).join("; "),
`,
        "batch error response",
      );
  if (patched !== source) fs.writeFileSync(batchTransformPath, patched, "utf8");
  if (patchedServer !== server) fs.writeFileSync(serverPath, patchedServer, "utf8");
  return patched !== source || patchedServer !== server;
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
