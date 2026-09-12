import { readFile } from "node:fs/promises";
import * as prettier from "prettier";
const patches = [];
for (const file of process.argv.slice(2)) {
  const source = await readFile(file, "utf8");
  const formatted = await prettier.format(source, { ...(await prettier.resolveConfig(file)), filepath: file });
  const before = source.replaceAll("\r\n", "\n").trimEnd().split("\n");
  const after = formatted.replaceAll("\r\n", "\n").trimEnd().split("\n");
  let start = 0;
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
  if (start === before.length && start === after.length) continue;
  let end = 0;
  while (end < Math.min(before.length, after.length) - start && before.at(-end-1) === after.at(-end-1)) end++;
  patches.push(`*** Update File: ${file}\n@@\n` + before.slice(start, before.length-end).map(line => `-${line}\n`).join("") + after.slice(start, after.length-end).map(line => `+${line}\n`).join(""));
}
console.log(JSON.stringify(patches.length ? `*** Begin Patch\n${patches.join("")}*** End Patch` : null));
