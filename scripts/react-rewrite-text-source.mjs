import fs from "node:fs";
import path from "node:path";

import { parseSource } from "../node_modules/react-rewrite-cli/dist/transform.js";
import {
  isProjectFilePathSafe,
  resolveProjectFilePath,
} from "../node_modules/react-rewrite-cli/dist/path-resolver.js";
import { logger } from "../node_modules/react-rewrite-cli/dist/logger.js";

const normalize = (text) => text.replace(/\s+/g, " ").trim();
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignoredDirectories = new Set([
  "testing",
  "__tests__",
  "__fixtures__",
  "stories",
  "node_modules",
]);
const literalTypes = new Set(["StringLiteral", "Literal", "TemplateLiteral"]);

function literalText(node) {
  if (
    (node.type === "StringLiteral" || node.type === "Literal") &&
    typeof node.value === "string"
  ) {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join("");
  }
  return null;
}

// Match React's JSX line handling, keeping adjacent inline elements adjacent.
function jsxText(value) {
  const lines = value.replace(/\t/g, " ").split(/\r\n|\n|\r/);
  const lastNonEmpty = lines.findLastIndex((line) => /[^ ]/.test(line));
  return lines
    .map((line, index) => {
      if (index > 0) line = line.replace(/^ +/, "");
      if (index < lines.length - 1) line = line.replace(/ +$/, "");
      return line && index < lastNonEmpty ? `${line} ` : line;
    })
    .join("");
}

function staticText(node) {
  if (node.type === "JSXText") return jsxText(node.value);
  if (node.type === "JSXExpressionContainer") {
    return node.expression.type === "JSXEmptyExpression" ? "" : literalText(node.expression);
  }
  if (node.type !== "JSXElement") return null;
  const chunks = node.children.map(staticText);
  return chunks.includes(null) ? null : chunks.join("");
}

export function containsText(node, text) {
  const value = staticText(node);
  return value !== null && normalize(text) !== "" && normalize(value) === normalize(text);
}

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : sourceFiles(file);
    return entry.isFile() &&
      sourceExtensions.has(path.extname(file)) &&
      !/\.(test|spec|stories|d)\.[^.]+$/.test(file)
      ? [file]
      : [];
  });
}

function isContentLiteral(candidate) {
  const parent = candidate.parent?.node;
  if (!parent) return false;
  // Exclude import paths, object keys, type literals, selectors, and API arguments.
  if (parent.type === "JSXAttribute") {
    return !/^(className|id|key|src|srcSet|href|to|role|type|data-.+|aria-(labelledby|describedby|controls))$/.test(
      parent.name.name,
    );
  }
  if (parent.type === "ObjectProperty" || parent.type === "Property") {
    return (
      parent.value === candidate.node &&
      !/^(id|key|src|href|className)$/.test(parent.key.name ?? parent.key.value)
    );
  }
  return [
    "VariableDeclarator",
    "ArrayExpression",
    "JSXExpressionContainer",
    "ReturnStatement",
  ].includes(parent.type);
}

function findCandidates(op, files, parsedFiles) {
  const jsx = [];
  const literals = [];
  for (const filePath of files) {
    if (!parsedFiles.has(filePath)) {
      try {
        parsedFiles.set(filePath, parseSource(fs.readFileSync(filePath, "utf8"), filePath));
      } catch {
        parsedFiles.set(filePath, null);
      }
    }
    const parsed = parsedFiles.get(filePath);
    if (!parsed) continue;
    parsed.root.find(parsed.j.Node).forEach((candidate) => {
      const node = candidate.node;
      if (node.type === "JSXElement") {
        const name = node.openingElement.name;
        const tag = name.type === "JSXIdentifier" ? name.name : name.property?.name;
        const textComponent =
          /^[A-Z]/.test(tag ?? "") && !node.children.some((child) => child.type === "JSXElement");
        if (
          (tag?.toLowerCase() === op.tagName?.toLowerCase() || textComponent) &&
          containsText(node, op.originalText)
        ) {
          jsx.push({ filePath, ...node.loc.start, end: node.loc.end, kind: "jsx" });
        }
      } else if (literalTypes.has(node.type) && isContentLiteral(candidate)) {
        const text = literalText(node);
        if (text !== null && normalize(text) === normalize(op.originalText)) {
          literals.push({ filePath, ...node.loc.start, kind: "literal" });
        }
      }
    });
  }
  // A literal inside a matched JSX element is the same edit target. Distinct
  // constants elsewhere still count toward ambiguity; never prefer one blindly.
  return [
    ...jsx,
    ...literals.filter(
      (literal) =>
        !jsx.some(
          (element) =>
            element.filePath === literal.filePath &&
            (literal.line > element.line ||
              (literal.line === element.line && literal.column >= element.column)) &&
            (literal.line < element.end.line ||
              (literal.line === element.end.line && literal.column < element.end.column)),
        ),
    ),
  ];
}

export function resolveTextOperationLocations(operations, projectRoot) {
  const parsedFiles = new Map();
  let files;
  return operations.map((input) => {
    // Never accept internal resolution hints supplied by the browser.
    const { test4testTextTarget: _target, test4testTextError: _error, ...op } = input;
    if (op.op !== "updateText" || !op.originalText || !isProjectFilePathSafe(op.file, projectRoot))
      return op;
    files ??= ["src", "design-system"].flatMap((directory) =>
      sourceFiles(path.join(projectRoot, directory)),
    );
    let candidates = findCandidates(op, files, parsedFiles);
    const reportedPath = resolveProjectFilePath(op.file, projectRoot);
    // A verified exact source position can disambiguate repeated copy.
    const exact = candidates.filter(
      (candidate) =>
        candidate.filePath === reportedPath &&
        candidate.line === op.line &&
        candidate.column === op.col,
    );
    if (exact.length === 1) candidates = exact;
    if (candidates.length !== 1) {
      const error = candidates.length
        ? `Text matches ${candidates.length} static locations; no files changed for this edit. Edit this repeated text in source.`
        : "No matching static text found in local source. This text may come from runtime data or an unsupported expression.";
      logger.debug(`[resolve:text-source] ${JSON.stringify(op.originalText)}: ${error}`);
      return { ...op, test4testTextError: error };
    }
    const candidate = candidates[0];
    const file = path.relative(projectRoot, candidate.filePath).replaceAll(path.sep, "/");
    logger.debug(
      `[resolve:text-source] ${candidate.kind} ${op.file}:${op.line}:${op.col} → ${file}:${candidate.line}:${candidate.column}`,
    );
    // A timestamp captured for a wrapper cannot validate a different source file.
    const metadata =
      candidate.filePath === reportedPath ? {} : { fileMtime: undefined, fileSize: undefined };
    return {
      ...op,
      ...metadata,
      file,
      line: candidate.line,
      col: candidate.column,
      test4testTextTarget: candidate.kind,
    };
  });
}

export function resolveStaticTextNode(j, root, op) {
  let target = null;
  root.find(j.Node).forEach((candidate) => {
    const node = candidate.node;
    if (node.loc?.start.line !== op.line || node.loc?.start.column !== op.col) return;
    const matches =
      op.test4testTextTarget === "jsx"
        ? node.type === "JSXElement" && containsText(node, op.originalText)
        : literalTypes.has(node.type) &&
          literalText(node) !== null &&
          normalize(literalText(node)) === normalize(op.originalText);
    if (matches) target = candidate;
  });
  return target;
}

export function mutateStaticTextLiteral(j, target, newText) {
  const replacement = j.stringLiteral(newText);
  // JSX attribute strings need expression syntax to safely contain quotes and <.
  target.replace(
    target.parent.node.type === "JSXAttribute"
      ? j.jsxExpressionContainer(replacement)
      : replacement,
  );
}
