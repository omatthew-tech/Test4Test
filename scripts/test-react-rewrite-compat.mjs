import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { prepareReactRewrite } from "./run-react-rewrite.mjs";

prepareReactRewrite();

const { executeBatch } = await import(
  `${pathToFileURL(path.resolve("node_modules/react-rewrite-cli/dist/batch-transform.js")).href}?test=${Date.now()}`
);

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "test4test-react-rewrite-"));
const originalText =
  "Create a usability test in seconds. Add your app, your instructions and share it as much as you want. It's 100% free - no credit cards required.";
const replacementText = originalText.replace("Add your app", "Add an app");

try {
  const wrapperPath = path.join(fixtureRoot, "design-system", "components", "data-display.tsx");
  const pagePath = path.join(fixtureRoot, "src", "pages", "HomePage.tsx");
  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  fs.writeFileSync(
    wrapperPath,
    "export function Card({ children }) { return <div>{children}</div>; }\n",
    "utf8",
  );
  fs.writeFileSync(
    pagePath,
    `export function HomePage() {
  return (
    <>
      <p>
        Create a usability test in seconds. Add your app, your instructions and share
        it as much as you want. It&apos;s 100% free - no credit cards required.
      </p>
      <p>It&apos;s free to try today.</p>
    </>
  );
}
`,
    "utf8",
  );

  const result = executeBatch(
    [
      {
        op: "updateText",
        file: "design-system/components/data-display.tsx",
        line: 5,
        col: 24,
        componentName: "Card",
        tagName: "p",
        originalText,
        newText: replacementText,
      },
      {
        op: "updateText",
        file: "design-system/components/data-display.tsx",
        line: 5,
        col: 24,
        componentName: "Card",
        tagName: "p",
        originalText: "It's free to try today.",
        newText: "It's simple to try today.",
      },
    ],
    fixtureRoot,
  );

  assert.equal(result.results[0]?.success, true, result.results[0]?.error);
  assert.equal(result.results[1]?.success, true, result.results[1]?.error);
  const updatedPage = fs.readFileSync(pagePath, "utf8");
  assert.match(updatedPage, /Add an app/);
  assert.match(updatedPage, /It's simple to try today/);
  assert.equal(updatedPage.includes("\r\n"), false, "The source line ending changed");
  assert.doesNotMatch(fs.readFileSync(wrapperPath, "utf8"), /Add an app/);
  console.log("ReactRewrite compatibility test passed.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
