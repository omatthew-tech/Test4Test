# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: home-how-it-works-journeys.spec.ts >> mobile how-it-works fades complete cards in order without controls or layout shifts
- Location: tests\playwright\home-how-it-works-journeys.spec.ts:51:1

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  getByTestId('home-how-it-works-section').getByRole('listitem').nth(1)
Expected: "0"
Received: "1"
Timeout:  5000ms

Call log:
  - Expect "toHaveCSS" with timeout 5000ms
  - waiting for getByTestId('home-how-it-works-section').getByRole('listitem').nth(1)
    14 × locator resolved to <li data-active="false" class="_stack_b935g_337 _gapLg_b935g_368 _howItWorksStep_4r67f_572">…</li>
       - unexpected value "1"

```

```yaml
- listitem:
  - heading "Get testers" [level=3]
  - paragraph: Share your test to unlimited users or earn credits by testing other founder's tests
```

# Test source

```ts
  1   | import AxeBuilder from "@axe-core/playwright";
  2   | import { expect, test, type Locator, type Page } from "@playwright/test";
  3   | 
  4   | const titles = ["Create your test", "Get testers", "Gain insights"];
  5   | const sectionSelector = '[data-testid="home-how-it-works-section"]';
  6   | 
  7   | test.beforeEach(async ({ page }) => {
  8   |   await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  9   |     throw new Error(`Homepage card checks must use fixtures: ${route.request().url()}`);
  10  |   });
  11  |   await page.setViewportSize({ width: 390, height: 844 });
  12  |   await page.emulateMedia({ reducedMotion: "no-preference" });
  13  |   await page.goto("/?ds-home-trusted=1");
  14  |   await expect(page.getByTestId("home-how-it-works-section")).toBeVisible();
  15  |   await page.evaluate(() => document.fonts.ready);
  16  |   await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  17  |   await page.clock.pauseAt(new Date("2026-09-12T12:00:01Z"));
  18  | });
  19  | 
  20  | async function waitForIntersection(page: Page, inView: boolean) {
  21  |   // Synchronize native intersection callbacks independently of the paused JavaScript clock.
  22  |   await page.locator(`${sectionSelector} ol`).evaluate(
  23  |     (element, expected) =>
  24  |       new Promise<void>((resolve) => {
  25  |         const observer = new IntersectionObserver(([entry]) => {
  26  |           if (entry.isIntersecting !== expected) return;
  27  |           observer.disconnect();
  28  |           resolve();
  29  |         });
  30  |         observer.observe(element);
  31  |       }),
  32  |     inView,
  33  |   );
  34  | }
  35  | 
  36  | async function showCards(page: Page) {
  37  |   const section = page.getByTestId("home-how-it-works-section");
  38  |   await section.locator("ol").scrollIntoViewIfNeeded();
  39  |   await waitForIntersection(page, true);
  40  |   return section;
  41  | }
  42  | 
  43  | async function expectActive(section: Locator, index: number) {
  44  |   await expect(section.locator('[data-active="true"] h3')).toHaveText(titles[index]);
  45  |   const cards = section.getByRole("listitem");
  46  |   for (let step = 0; step < titles.length; step += 1) {
> 47  |     await expect(cards.nth(step)).toHaveCSS("opacity", step === index ? "1" : "0");
      |                                   ^ Error: expect(locator).toHaveCSS(expected) failed
  48  |   }
  49  | }
  50  | 
  51  | test("mobile how-it-works fades complete cards in order without controls or layout shifts", async ({
  52  |   page,
  53  | }, testInfo) => {
  54  |   const section = await showCards(page);
  55  |   const cards = section.getByRole("listitem");
  56  |   await expect(cards).toHaveCount(3);
  57  |   await expect(section.getByRole("heading", { level: 3 })).toHaveText(titles);
  58  |   await expect(section.locator("button, a, [aria-live]")).toHaveCount(0);
  59  |   await expectActive(section, 0);
  60  |   const initialBounds = await section.boundingBox();
  61  | 
  62  |   for (const card of await cards.all()) {
  63  |     await expect(card).toHaveCSS("transition-property", "opacity");
  64  |     await expect(card).toHaveCSS("transition-duration", "0.36s");
  65  |     await expect(card.locator("img")).toHaveJSProperty("complete", true);
  66  |     await expect
  67  |       .poll(() => card.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth))
  68  |       .toBeGreaterThan(0);
  69  |     const image = await card.locator("img").boundingBox();
  70  |     const heading = await card.locator("h3").boundingBox();
  71  |     expect(heading!.y).toBeGreaterThanOrEqual(image!.y + image!.height);
  72  |   }
  73  | 
  74  |   await page.clock.runFor(4999);
  75  |   await expectActive(section, 0);
  76  |   await page.clock.runFor(1);
  77  |   await expectActive(section, 1);
  78  |   await section.screenshot({ path: testInfo.outputPath("mobile-card-2.png") });
  79  |   expect(await section.boundingBox()).toEqual(initialBounds);
  80  | 
  81  |   for (const index of [2, 0]) {
  82  |     await page.clock.runFor(5360);
  83  |     await expectActive(section, index);
  84  |     expect(await section.boundingBox()).toEqual(initialBounds);
  85  |   }
  86  | 
  87  |   const snapshot = await section.ariaSnapshot();
  88  |   for (const title of titles) expect(snapshot).toContain(title);
  89  |   await page.clock.resume();
  90  |   expect((await new AxeBuilder({ page }).include(sectionSelector).analyze()).violations).toEqual(
  91  |     [],
  92  |   );
  93  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  94  | });
  95  | 
  96  | test("mobile how-it-works suspends offscreen and in hidden tabs with a fresh reading interval", async ({
  97  |   page,
  98  | }) => {
  99  |   const section = page.getByTestId("home-how-it-works-section");
  100 |   await page.clock.runFor(10000);
  101 |   await expectActive(section, 0);
  102 |   await expect(section).toHaveAttribute("data-background-playing", "false");
  103 |   await showCards(page);
  104 |   await expect(section).toHaveAttribute("data-background-playing", "true");
  105 |   await page.clock.runFor(5000);
  106 |   await expectActive(section, 1);
  107 | 
  108 |   await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
  109 |   await expect(section.locator("ol")).not.toBeInViewport();
  110 |   await waitForIntersection(page, false);
  111 |   await expect(section).toHaveAttribute("data-background-playing", "false");
  112 |   await page.clock.runFor(10000);
  113 |   await expectActive(section, 1);
  114 |   await showCards(page);
  115 |   await page.clock.runFor(4999);
  116 |   await expectActive(section, 1);
  117 |   await page.clock.runFor(1);
  118 |   await expectActive(section, 2);
  119 | 
  120 |   await page.evaluate(() => {
  121 |     Object.defineProperty(document, "hidden", { configurable: true, value: true });
  122 |     document.dispatchEvent(new Event("visibilitychange"));
  123 |   });
  124 |   await expect(section).toHaveAttribute("data-background-playing", "false");
  125 |   await page.clock.runFor(10000);
  126 |   await expectActive(section, 2);
  127 |   await page.evaluate(() => {
  128 |     Object.defineProperty(document, "hidden", { configurable: true, value: false });
  129 |     document.dispatchEvent(new Event("visibilitychange"));
  130 |   });
  131 |   await expect(section).toHaveAttribute("data-background-playing", "true");
  132 |   await page.clock.runFor(4999);
  133 |   await expectActive(section, 2);
  134 |   await page.clock.runFor(1);
  135 |   await expectActive(section, 0);
  136 | });
  137 | 
  138 | test("desktop background colors move together while screenshots, copy, and white gaps stay fixed", async ({
  139 |   page,
  140 | }, testInfo) => {
  141 |   await page.setViewportSize({ width: 1440, height: 900 });
  142 |   const section = await showCards(page);
  143 |   const media = section.getByTestId("home-how-it-works-media");
  144 |   const flows = section.getByTestId("home-how-it-works-flow");
  145 |   await expect(media).toHaveCount(3);
  146 |   await expect(flows).toHaveCount(3);
  147 |   await expect(section.locator("button")).toHaveCount(0);
```