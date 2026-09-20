# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat.journeys.spec.ts >> chat email at 1440px
- Location: tests\playwright\chat.journeys.spec.ts:61:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 76

- Array []
+ Array [
+   Object {
+     "description": "Ensure each HTML document contains a non-empty <title> element",
+     "help": "Documents must have <title> element to aid in navigation",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/document-title?application=playwright",
+     "id": "document-title",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": null,
+             "id": "doc-has-title",
+             "impact": "serious",
+             "message": "Document does not have a non-empty <title> element",
+             "relatedNodes": Array [],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Document does not have a non-empty <title> element",
+         "html": "<html lang=\"en\">",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "html",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.text-alternatives",
+       "wcag2a",
+       "wcag242",
+       "TTv5",
+       "TT12.a",
+       "EN-301-549",
+       "EN-9.2.4.2",
+       "ACT",
+       "RGAAv4",
+       "RGAA-8.5.1",
+     ],
+   },
+   Object {
+     "description": "Ensure the document has a main landmark",
+     "help": "Document should have one main landmark",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/landmark-one-main?application=playwright",
+     "id": "landmark-one-main",
+     "impact": "moderate",
+     "nodes": Array [
+       Object {
+         "all": Array [
+           Object {
+             "data": null,
+             "id": "page-has-main",
+             "impact": "moderate",
+             "message": "Document does not have a main landmark",
+             "relatedNodes": Array [],
+           },
+         ],
+         "any": Array [],
+         "failureSummary": "Fix all of the following:
+   Document does not have a main landmark",
+         "html": "<html lang=\"en\">",
+         "impact": "moderate",
+         "none": Array [],
+         "target": Array [
+           "html",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.semantics",
+       "best-practice",
+     ],
+   },
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - text: Test4Test
  - heading "The founder of MastoMetrics sent you a message" [level=1] [ref=e2]
  - text: Thanks for testing MastoMetrics. Your feedback on the first screen was helpful. Could you tell me a little more about what you expected to see when you opened …
  - link "View message" [ref=e3] [cursor=pointer]:
    - /url: https://test4test.io/messages/preview
```

# Test source

```ts
  1  | import AxeBuilder from "@axe-core/playwright";
  2  | import { expect, test } from "@playwright/test";
  3  | import { readFile } from "node:fs/promises";
  4  | 
  5  | for (const viewport of [
  6  |   { width: 390, height: 844 },
  7  |   { width: 1440, height: 900 },
  8  | ]) {
  9  |   test(`chat inbox and conversation at ${viewport.width}px`, async ({ page }, testInfo) => {
  10 |     await page.setViewportSize(viewport);
  11 |     await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  12 |       throw new Error(`Chat fixture contacted Supabase: ${route.request().url()}`);
  13 |     });
  14 |     await page.goto("/messages?ds-user=user-mateo");
  15 |     await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  16 |     await page
  17 |       .getByRole("navigation", { name: "Conversations", exact: true })
  18 |       .getByRole("link")
  19 |       .first()
  20 |       .click();
  21 |     const composer = page.getByRole("textbox", { name: "Message", exact: true });
  22 |     await expect(composer).toBeVisible();
  23 |     await composer.fill("Thanks for your feedback!\nCan you tell me more about the first screen?");
  24 |     await page.getByRole("button", { name: "Send message", exact: true }).click();
  25 |     await expect(page.getByRole("region", { name: "Message history" })).toContainText(
  26 |       "Can you tell me more about the first screen?",
  27 |     );
  28 |     await expect(composer).toHaveValue("");
  29 |     await page.reload();
  30 |     await expect(page.getByRole("region", { name: "Message history" })).toContainText(
  31 |       "Thanks for your feedback!",
  32 |     );
  33 |     expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  34 |     expect(
  35 |       await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  36 |     ).toBe(true);
  37 |     await page.screenshot({
  38 |       path: testInfo.outputPath(`chat-${viewport.width}.png`),
  39 |       fullPage: true,
  40 |     });
  41 |     if (viewport.width === 390) {
  42 |       await page.getByRole("link", { name: "Back to messages" }).click();
  43 |       await expect(
  44 |         page.getByRole("navigation", { name: "Conversations", exact: true }),
  45 |       ).toBeVisible();
  46 |     }
  47 |     await page.goto("/messages?ds-tester=locked");
  48 |     await expect(page).toHaveURL(/\/messages/);
  49 |     await page
  50 |       .getByRole("navigation", { name: "Conversations", exact: true })
  51 |       .getByRole("link")
  52 |       .first()
  53 |       .click();
  54 |     await composer.fill("I found the navigation easy to use.");
  55 |     await page.getByRole("button", { name: "Send message", exact: true }).click();
  56 |     await expect(page.getByRole("region", { name: "Message history" })).toContainText(
  57 |       "I found the navigation easy to use.",
  58 |     );
  59 |   });
  60 | 
  61 |   test(`chat email at ${viewport.width}px`, async ({ page }, testInfo) => {
  62 |     await page.setViewportSize(viewport);
  63 |     const markup = await readFile("output/chat-email-preview.html", "utf8");
  64 |     await page.goto("/");
  65 |     await page.setContent(
  66 |       markup.replaceAll("https://test4test.io/brand/", "http://127.0.0.1:4173/brand/"),
  67 |     );
  68 |     await expect(page.getByRole("heading", { level: 1 })).toContainText("The founder of");
  69 |     await expect(page.getByRole("link", { name: "View message" })).toBeVisible();
  70 |     expect(
  71 |       (await new AxeBuilder({ page }).analyze()).violations.filter(
  72 |         (violation) => violation.id !== "region",
  73 |       ),
> 74 |     ).toEqual([]);
     |       ^ Error: expect(received).toEqual(expected) // deep equality
  75 |     expect(
  76 |       await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  77 |     ).toBe(true);
  78 |     await page.screenshot({
  79 |       path: testInfo.outputPath(`chat-email-${viewport.width}.png`),
  80 |       fullPage: true,
  81 |     });
  82 |   });
  83 | }
  84 | 
  85 | test("chat deep link preserves its destination through sign-in", async ({ page }) => {
  86 |   await page.goto("/messages/not-a-member");
  87 |   await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fmessages%2Fnot-a-member/);
  88 | });
  89 | 
```