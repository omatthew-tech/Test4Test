import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const result = await build({ logLevel: "error", build: { write: false } });
const outputs = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output;
const files = new Map(outputs.map((item) => [item.fileName, item]));
const entry = outputs.find((item) => item.type === "chunk" && item.isEntry);
assert(entry, "Production entry is missing");
const initial = new Set();
const visit = (name) => {
  if (initial.has(name)) return;
  initial.add(name);
  const chunk = files.get(name);
  if (chunk?.type === "chunk") chunk.imports.forEach(visit);
};
visit(entry.fileName);
const scripts = [...initial]
  .map((name) => files.get(name))
  .filter((item) => item?.type === "chunk");
const modules = scripts.flatMap((chunk) => Object.keys(chunk.modules));
assert(
  !modules.some((id) => /[/\\](HomePage|generalQuestionBank)\.[jt]sx?$/.test(id)),
  "Homepage/question bank leaked into common startup",
);
const cssNames = new Set(scripts.flatMap((chunk) => [...(chunk.viteMetadata?.importedCss ?? [])]));
const sum = (items, compress) =>
  items.reduce(
    (bytes, item) => bytes + (compress ? gzipSync(item).length : Buffer.byteLength(item)),
    0,
  );
const js = scripts.map((chunk) => chunk.code);
const css = [...cssNames].map((name) => files.get(name).source);
const metrics = {
  initialJsBytes: sum(js, false),
  initialJsGzipBytes: sum(js, true),
  initialCssBytes: sum(css, false),
  initialCssGzipBytes: sum(css, true),
};
// Modest headroom above this change; baseline was 562700 B JS / 150041 B CSS.
assert(metrics.initialJsBytes <= 530000, "Initial JavaScript budget exceeded");
assert(metrics.initialJsGzipBytes <= 155000, "Compressed initial JavaScript budget exceeded");
assert(metrics.initialCssBytes <= 125000, "Initial CSS budget exceeded");
assert(metrics.initialCssGzipBytes <= 18000, "Compressed initial CSS budget exceeded");
const assets = JSON.parse(String(files.get("assets/static-asset-manifest.json").source));
for (const [source, target] of Object.entries(assets)) {
  const emitted = files.get(target.slice(1));
  assert(emitted?.type === "asset", `Missing versioned asset ${target}`);
  assert.deepEqual(
    Buffer.from(emitted.source),
    readFileSync(`public${source}`),
    `Asset bytes changed: ${source}`,
  );
}
const html = String(files.get("index.html").source);
assert(
  html.includes(assets["/fonts/geist/GeistVF.woff2"]),
  "Font preload must use the same versioned URL as CSS",
);
console.log(JSON.stringify({ ...metrics, exactByteAssets: Object.keys(assets).length }, null, 2));
