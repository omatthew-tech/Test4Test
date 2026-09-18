# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> patterns-product--star-rating-display-contract at tablet
- Location: tests\playwright\visual.spec.ts:155:5

# Error details

```
Error: A snapshot doesn't exist at C:\Projects\Test4Test-Redesign\tests\playwright\visual.spec.ts-snapshots\patterns-product--star-rating-display-contract-tablet-visual-win32.png.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - img "1 out of 5 stars" [ref=e4]:
    - img [ref=e5]
    - img [ref=e7]
    - img [ref=e9]
    - img [ref=e11]
    - img [ref=e13]
  - img "2 out of 5 stars" [ref=e15]:
    - img [ref=e16]
    - img [ref=e18]
    - img [ref=e20]
    - img [ref=e22]
    - img [ref=e24]
  - img "3 out of 5 stars" [ref=e26]:
    - img [ref=e27]
    - img [ref=e29]
    - img [ref=e31]
    - img [ref=e33]
    - img [ref=e35]
  - img "4 out of 5 stars" [ref=e37]:
    - img [ref=e38]
    - img [ref=e40]
    - img [ref=e42]
    - img [ref=e44]
    - img [ref=e46]
  - img "5 out of 5 stars" [ref=e48]:
    - img [ref=e49]
    - img [ref=e51]
    - img [ref=e53]
    - img [ref=e55]
    - img [ref=e57]
  - generic [ref=e59]: Not rated
```

# Test source

```ts
  65  |   "patterns-product--rating-control-contract",
  66  |   "patterns-product--star-rating-display-contract",
  67  |   "patterns-product--recording-status-contract",
  68  |   "patterns-product--test-row-contract",
  69  |   "patterns-product--earn-test-card-contract",
  70  |   "patterns-product--question-editor-contract",
  71  |   "patterns-product--response-viewer-contract",
  72  | ];
  73  | 
  74  | const explicitStateStories = [
  75  |   "components-navigation--top-navigation-public-state",
  76  |   "components-navigation--mobile-navigation-drawer-open-state",
  77  |   "components-feedback--toast-info-state",
  78  |   "components-feedback--toast-warning-state",
  79  |   "components-feedback--toast-danger-state",
  80  |   "components-overlays--dialog-open-state",
  81  |   "components-overlays--drawer-open-state",
  82  |   "components-overlays--popover-open-state",
  83  |   "components-overlays--tooltip-open-state",
  84  | ];
  85  | 
  86  | const stories = [...representativeStories, ...contractStories, ...explicitStateStories];
  87  | 
  88  | const viewportScreenshotStories = new Set([
  89  |   "components-feedback--toast-contract",
  90  |   "components-feedback--toast-info-state",
  91  |   "components-feedback--toast-warning-state",
  92  |   "components-feedback--toast-danger-state",
  93  |   "components-navigation--mobile-navigation-drawer-open-state",
  94  |   "components-overlays--dialog-open-state",
  95  |   "components-overlays--drawer-open-state",
  96  | ]);
  97  | 
  98  | const viewports = [
  99  |   { name: "mobile", width: 390, height: 844 },
  100 |   { name: "tablet", width: 768, height: 1024 },
  101 |   { name: "laptop", width: 1024, height: 768 },
  102 |   { name: "desktop", width: 1440, height: 900 },
  103 | ];
  104 | 
  105 | test.beforeEach(async ({ page }) => {
  106 |   await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  107 |     throw new Error(`Visual tests must not contact Supabase: ${route.request().url()}`);
  108 |   });
  109 | });
  110 | 
  111 | async function settleRouteImages(page: Page) {
  112 |   const images = page.locator("main img");
  113 |   const count = await images.count();
  114 |   // Eager images in moving tracks already load without scrolling. Waiting for
  115 |   // their geometry to settle would hang on a continuously animated carousel.
  116 |   const lazyImages = page.locator('main img[loading="lazy"]:visible');
  117 |   for (let index = 0; index < (await lazyImages.count()); index += 1) {
  118 |     await lazyImages.nth(index).scrollIntoViewIfNeeded();
  119 |   }
  120 |   if (count > 0) {
  121 |     await expect
  122 |       .poll(
  123 |         () =>
  124 |           images.evaluateAll((elements) =>
  125 |             elements.every(
  126 |               (element) =>
  127 |                 element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
  128 |             ),
  129 |           ),
  130 |         { message: "All route images should finish decoding before visual capture" },
  131 |       )
  132 |       .toBe(true);
  133 |     await page.evaluate(() => window.scrollTo(0, 0));
  134 |   }
  135 | 
  136 |   const homeHeroPanel = page.getByTestId("home-hero-panel");
  137 |   if ((await homeHeroPanel.count()) > 0) {
  138 |     const backgroundImageUrl = await homeHeroPanel.evaluate((element) => {
  139 |       const backgroundImage = window.getComputedStyle(element).backgroundImage;
  140 |       return backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] ?? null;
  141 |     });
  142 | 
  143 |     if (backgroundImageUrl) {
  144 |       await page.evaluate(async (source) => {
  145 |         const image = new Image();
  146 |         image.src = source;
  147 |         await image.decode();
  148 |       }, backgroundImageUrl);
  149 |     }
  150 |   }
  151 | }
  152 | 
  153 | for (const story of stories) {
  154 |   for (const viewport of viewports) {
  155 |     test(`${story} at ${viewport.name}`, async ({ page }) => {
  156 |       await page.setViewportSize({ width: viewport.width, height: viewport.height });
  157 |       await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  158 |       await page.waitForLoadState("networkidle");
  159 |       const screenshotName = `${story}-${viewport.name}.png`;
  160 |       const options = { animations: "disabled" as const };
  161 | 
  162 |       if (viewportScreenshotStories.has(story)) {
  163 |         await expect(page).toHaveScreenshot(screenshotName, options);
  164 |       } else {
> 165 |         await expect(page.locator("#storybook-root")).toHaveScreenshot(screenshotName, options);
      |                                                       ^ Error: A snapshot doesn't exist at C:\Projects\Test4Test-Redesign\tests\playwright\visual.spec.ts-snapshots\patterns-product--star-rating-display-contract-tablet-visual-win32.png.
  166 |       }
  167 |     });
  168 |   }
  169 | }
  170 | 
  171 | for (const route of renderableRouteStates) {
  172 |   for (const viewport of viewports) {
  173 |     test(`${route.name} route at ${viewport.name}`, async ({ page }) => {
  174 |       await page.setViewportSize({ width: viewport.width, height: viewport.height });
  175 |       await page.goto(`http://127.0.0.1:4173${route.path}`);
  176 |       await page.waitForLoadState("domcontentloaded");
  177 |       await expect(page.locator("main")).toBeVisible();
  178 |       await settleRouteImages(page);
  179 |       await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
  180 |         animations: "disabled",
  181 |         fullPage: true,
  182 |       });
  183 |     });
  184 |   }
  185 | }
  186 | 
```