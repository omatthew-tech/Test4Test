# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: star-ratings.journeys.spec.ts >> submitted ratings preserve stars beside every status at 390px
- Location: tests\playwright\star-ratings.journeys.spec.ts:8:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/submissions?ds-user=user-avery&ds-star-ratings=1
Call log:
  - navigating to "http://127.0.0.1:4173/submissions?ds-user=user-avery&ds-star-ratings=1", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import AxeBuilder from "@axe-core/playwright";
  3  | 
  4  | for (const viewport of [
  5  |   { width: 1440, height: 900 },
  6  |   { width: 390, height: 844 },
  7  | ]) {
  8  |   test(`submitted ratings preserve stars beside every status at ${viewport.width}px`, async ({
  9  |     page,
  10 |   }, testInfo) => {
  11 |     await page.setViewportSize(viewport);
  12 |     await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  13 |       throw new Error(`Fixture contacted Supabase: ${route.request().url()}`);
  14 |     });
> 15 |     await page.goto("/submissions?ds-user=user-avery&ds-star-ratings=1");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/submissions?ds-user=user-avery&ds-star-ratings=1
  16 |     const cards = page.locator(".submission-feedback-card");
  17 |     await expect(cards).toHaveCount(6);
  18 |     await expect(cards.getByRole("link", { name: /^Message about / })).toHaveCount(6);
  19 |     const unratedCard = cards.filter({
  20 |       has: page.getByRole("heading", { name: "Unrated recording", exact: true }),
  21 |     });
  22 |     const message = unratedCard.getByRole("link", { name: "Message about Unrated recording" });
  23 |     const bookmark = unratedCard.getByRole("button", { name: /favorites/ });
  24 |     await expect(message).toHaveAttribute(
  25 |       "href",
  26 |       "/messages?response=response-palette-1&ds-user=user-avery",
  27 |     );
  28 |     for (const action of [message, bookmark]) {
  29 |       const bounds = await action.boundingBox();
  30 |       expect(bounds!.width).toBeGreaterThanOrEqual(44);
  31 |       expect(bounds!.height).toBeGreaterThanOrEqual(44);
  32 |       const icon = await action.locator("svg").boundingBox();
  33 |       expect(icon!.width).toBe(16);
  34 |       expect(icon!.height).toBe(16);
  35 |     }
  36 |     const messageBounds = (await message.boundingBox())!;
  37 |     const bookmarkBounds = (await bookmark.boundingBox())!;
  38 |     expect(messageBounds.x + messageBounds.width).toBeLessThanOrEqual(bookmarkBounds.x);
  39 |     expect(messageBounds.y).toBe(bookmarkBounds.y);
  40 |     await message.focus();
  41 |     await expect(message).toBeFocused();
  42 |     await page.keyboard.press("Tab");
  43 |     await expect(bookmark).toBeFocused();
  44 |     for (const stars of [1, 2, 3, 4, 5]) {
  45 |       const card = cards.filter({
  46 |         has: page.getByRole("heading", { name: `${stars}-star recording`, exact: true }),
  47 |       });
  48 |       const display = card.getByRole("img", { name: `${stars} out of 5 stars` });
  49 |       await expect(display).toBeVisible();
  50 |       expect(
  51 |         await display
  52 |           .locator("svg")
  53 |           .evaluateAll(
  54 |             (icons) => icons.filter((icon) => getComputedStyle(icon).fill !== "none").length,
  55 |           ),
  56 |       ).toBe(stars);
  57 |       await expect(card.getByRole("button", { name: /favorites/ })).toHaveCount(
  58 |         stars === 5 ? 1 : 0,
  59 |       );
  60 |     }
  61 |     await expect(cards.nth(0).getByRole("heading")).toHaveText("1-star recording");
  62 |     await expect(cards.nth(1).getByRole("heading")).toHaveText("2-star recording");
  63 |     await expect(cards.nth(2).getByText("Report in progress")).toBeVisible();
  64 |     await expect(cards.nth(3).getByText("Test closed")).toBeVisible();
  65 |     await expect(cards.nth(3).getByRole("link", { name: "Report Rating" })).toBeVisible();
  66 |     await expect(page.getByText("Not rated", { exact: true })).toHaveCount(0);
  67 |     await expect(page.getByRole("radio")).toHaveCount(0);
  68 |     expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  69 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  70 |       true,
  71 |     );
  72 |     await page.getByRole("heading", { name: "Unrated recording", exact: true }).click();
  73 |     await page.screenshot({
  74 |       path: testInfo.outputPath(`submitted-stars-${viewport.width}.png`),
  75 |       fullPage: true,
  76 |     });
  77 |     await message.click();
  78 |     await expect(page).toHaveURL(/\/messages\?response=response-palette-1&ds-user=user-avery$/);
  79 |     const composer = page.getByRole("textbox", { name: "Message", exact: true });
  80 |     await expect(composer).toBeVisible();
  81 |     await expect(page.getByText("Start a conversation about Palette Pilot.")).toBeVisible();
  82 |     await composer.fill("Thanks for sharing your app. I have a question about my feedback.");
  83 |     await page.getByRole("button", { name: "Send message", exact: true }).click();
  84 |     await expect(page.getByRole("region", { name: "Message history" })).toContainText(
  85 |       "I have a question about my feedback.",
  86 |     );
  87 |     await expect(page).toHaveURL(/\/messages\/[^?]+\?ds-user=user-avery$/);
  88 |     await page.goto("/submissions?ds-user=user-avery&ds-star-ratings=1");
  89 |     await message.click();
  90 |     await expect(page.getByRole("region", { name: "Message history" })).toContainText(
  91 |       "I have a question about my feedback.",
  92 |     );
  93 |     await expect(page.getByText("Start a conversation about Palette Pilot.")).toHaveCount(0);
  94 |   });
  95 | }
  96 | 
```