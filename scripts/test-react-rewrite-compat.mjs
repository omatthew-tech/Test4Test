import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import WebSocket from "ws";

import { prepareReactRewrite } from "./run-react-rewrite.mjs";
import { parseSource } from "../node_modules/react-rewrite-cli/dist/transform.js";

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

  function fixture(name, source, additionalFiles = {}) {
    const directory = path.join(fixtureRoot, name);
    const files = {
      "src/Page.tsx": source,
      "design-system/components/layout.tsx":
        "export function Stack({ children }) { return <div>{children}</div>; }\n",
      ...additionalFiles,
    };
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return {
      directory,
      read: (file = "src/Page.tsx") => fs.readFileSync(path.join(directory, file), "utf8"),
      edit: (originalText, newText, extra = {}) =>
        executeBatch(
          [
            {
              op: "updateText",
              file: "/design-system/components/layout.tsx",
              line: 50,
              col: 25,
              tagName: "h2",
              originalText,
              newText,
              ...extra,
            },
          ],
          directory,
        ),
    };
  }

  const mapped = fixture(
    "mapped-heading",
    'const methods = [{ title: "Test other founders" }];\nexport function Page() { return methods.map(method => <h2>{method.title}</h2>); }\n',
  );
  const mappedResult = mapped.edit("Test other founders", "Test fellow founders", {
    fileMtime: 1,
    fileSize: 1,
  });
  assert.equal(mappedResult.results[0].success, true, mappedResult.results[0].error);
  assert.match(mapped.read(), /title: "Test fellow founders"/);
  assert.match(mapped.read(), /<h2>\{method.title\}<\/h2>/);
  assert.equal(mappedResult.undoEntries[0].content.includes('title: "Test other founders"'), true);
  assert.equal(mappedResult.undoEntries[0].afterContent, mapped.read());
  assert.equal(mapped.edit("Test fellow founders", "Test founders again").results[0].success, true);

  const props = fixture(
    "text-prop",
    'export function Page() { return <Heading title="Our community" />; }\n',
  );
  const propText = 'Our "community" <&> friends';
  assert.equal(props.edit("Our community", propText).results[0].success, true);
  const parsedProp = parseSource(props.read(), "Page.tsx");
  assert.equal(
    parsedProp.root.find(parsedProp.j.JSXAttribute).nodes()[0].value.expression.value,
    propText,
  );

  const template = fixture(
    "template",
    "const title = `Meet our testers`;\r\nexport function Page() { return <h2>{title}</h2>; }\r\n",
  );
  const templateText = "Meet ${literal} `testers` \\ friends";
  assert.equal(template.edit("Meet our testers", templateText).results[0].success, true);
  const parsedTemplate = parseSource(template.read(), "Page.tsx");
  assert.equal(
    parsedTemplate.root.find(parsedTemplate.j.VariableDeclarator).nodes()[0].init.value,
    templateText,
  );
  assert.equal(/(?<!\r)\n/.test(template.read()), false, "CRLF line endings changed");

  const nested = fixture(
    "inline-markup",
    "export function Page() { return <h2>Try <strong>our</strong> tools</h2>; }\n",
  );
  assert.equal(nested.edit("Try our tools", "Try the tools").results[0].success, true);
  assert.match(nested.read(), /<strong>the<\/strong>/);

  const encoded = fixture(
    "encoded",
    "export function Page() { return <h2>Cr&#233;ate &amp; share</h2>; }\n",
  );
  assert.equal(encoded.edit("Créate & share", "Create and share").results[0].success, true);

  const component = fixture(
    "text-component",
    'export function Page() { return <Heading>{"Welcome founders"}</Heading>; }\n',
  );
  assert.equal(component.edit("Welcome founders", "Welcome testers").results[0].success, true);
  assert.match(component.read(), /Welcome testers/);

  const mixed = fixture(
    "mixed-ambiguity",
    'const title = "Same heading";\nexport function Page() { return <h2>Same heading</h2>; }\n',
  );
  assert.equal(mixed.edit("Same heading", "Do not guess").results[0].success, false);
  assert.match(mixed.read(), /<h2>Same heading<\/h2>/);

  const ambiguous = fixture(
    "ambiguous",
    'const first = "Repeated heading";\nconst second = "Repeated heading";\n',
  );
  const ambiguousBefore = ambiguous.read();
  const ambiguousResult = ambiguous.edit("Repeated heading", "Wrong heading");
  assert.equal(ambiguousResult.results[0].success, false);
  assert.match(ambiguousResult.results[0].error, /2 static locations/);
  assert.equal(ambiguous.read(), ambiguousBefore);
  assert.deepEqual(ambiguousResult.undoEntries, []);

  const dynamic = fixture(
    "dynamic",
    "export function Page({ record }) { return <><h2>{record.title}</h2><p>Local text</p></>; }\n",
  );
  const dynamicBefore = dynamic.read();
  const dynamicResult = dynamic.edit("Remote heading", "Local heading", {
    file: "src/Page.tsx",
    line: 1,
    col: 0,
  });
  assert.equal(dynamicResult.results[0].success, false);
  assert.match(dynamicResult.results[0].error, /No matching static text/);
  assert.equal(dynamic.read(), dynamicBefore);

  const stale = fixture(
    "stale",
    "export function Page() { return <h2>Save before editing</h2>; }\n",
  );
  assert.equal(
    stale.edit("Save before editing", "Changed", {
      file: "src/Page.tsx",
      fileMtime: 1,
      fileSize: 1,
    }).results[0].success,
    false,
  );
  assert.match(stale.read(), /Save before editing/);
  assert.equal(
    stale.edit("Save before editing", "Changed", { file: "../outside.tsx" }).results[0].success,
    false,
  );

  const ignored = fixture("test-fixtures", 'const title = "Runtime heading";\n', {
    "src/testing/fixture.ts": 'const title = "Runtime heading";\n',
    "design-system/stories/Heading.stories.tsx": 'const title = "Runtime heading";\n',
  });
  assert.equal(ignored.edit("Runtime heading", "Updated heading").results[0].success, true);
  assert.match(ignored.read("src/testing/fixture.ts"), /Runtime heading/);
  assert.equal(prepareReactRewrite(), false, "The patch must be idempotent");

  // Exercise the same WebSocket commit, error, and undo contract as the overlay.
  const { createSketchServer } = await import("../node_modules/react-rewrite-cli/dist/server.js");
  const previousDirectory = process.cwd();
  let server;
  try {
    process.chdir(mapped.directory);
    server = createSketchServer(0);
  } finally {
    process.chdir(previousDirectory);
  }
  let socket;
  try {
    if (!server.wss.address()) await once(server.wss, "listening");
    socket = new WebSocket(`ws://127.0.0.1:${server.wss.address().port}`);
    await once(socket, "open");
    async function request(message) {
      const response = once(socket, "message", { signal: AbortSignal.timeout(5000) });
      socket.send(JSON.stringify(message));
      return JSON.parse((await response)[0].toString());
    }
    const beforeCommit = mapped.read();
    const operation = {
      op: "updateText",
      file: "/design-system/components/layout.tsx",
      line: 50,
      col: 25,
      tagName: "h2",
      originalText: "Test founders again",
      newText: "Test with friends",
    };
    const committed = await request({ type: "commitBatch", operations: [operation] });
    assert.equal(committed.type, "commitBatchComplete");
    assert.equal(committed.success, true, committed.error);
    assert.match(mapped.read(), /Test with friends/);
    const reverted = await request({ type: "revertChanges", undoIds: committed.undoIds });
    assert.equal(reverted.results[0].success, true);
    assert.equal(mapped.read(), beforeCommit);
    const failed = await request({
      type: "commitBatch",
      operations: [{ ...operation, originalText: "Runtime-only heading" }],
    });
    assert.equal(failed.success, false);
    assert.match(failed.error, /No matching static text/);
    assert.equal(mapped.read(), beforeCommit);
  } finally {
    socket?.terminate();
    await new Promise((resolve) => server.wss.close(resolve));
  }
  console.log(
    "ReactRewrite compatibility tests passed (JSX, constants, props, templates, repeat edits, WebSocket commit/undo/errors, ambiguity, runtime data, staleness, and path safety).",
  );
} finally {
  assert.equal(path.dirname(path.resolve(fixtureRoot)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(fixtureRoot).startsWith("test4test-react-rewrite-"));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
