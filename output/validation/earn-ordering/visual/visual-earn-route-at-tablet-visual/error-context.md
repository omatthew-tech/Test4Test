# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> earn route at tablet
- Location: tests\playwright\visual.spec.ts:175:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  Expected an image 768px by 1268px, received 768px by 1024px. 22287 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: earn-tablet.png

Call log:
  - Expect "toHaveScreenshot(earn-tablet.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - Expected an image 768px by 1268px, received 768px by 1024px. 22287 pixels (ratio 0.03 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - Expected an image 768px by 1268px, received 768px by 1024px. 22287 pixels (ratio 0.03 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e6]:
    - link "Skip to content" [ref=e7] [cursor=pointer]:
      - /url: "#main-content"
    - generic [ref=e9]:
      - link "Test4Test home" [ref=e10] [cursor=pointer]:
        - /url: /
        - img [ref=e11]
        - generic [ref=e14]: Test4Test
      - button "Open navigation" [ref=e16] [cursor=pointer]:
        - img [ref=e17]
  - main [ref=e18]:
    - generic [ref=e20]:
      - generic [ref=e21]:
        - heading "Earn" [level=1] [ref=e22]
        - generic [ref=e23]:
          - heading "Loading your visibility" [level=2] [ref=e26]
          - generic "Earn visibility metrics" [ref=e27]:
            - generic [ref=e28]:
              - img
              - strong [ref=e30]:
                - generic [ref=e31]: Rank
                - text: ...
              - button "How Earn ranking works" [ref=e34] [cursor=pointer]:
                - img [ref=e35]
              - generic [ref=e37]: Loading Rank
            - generic [ref=e38]:
              - generic [ref=e39]:
                - strong [ref=e40]: ...
                - generic [ref=e41]: Test-back rate
              - generic [ref=e42]:
                - strong [ref=e43]: ...
                - generic [ref=e44]: Satisfaction rate
              - generic [ref=e45]:
                - strong [ref=e46]: ...
                - generic [ref=e47]: Credits
        - button "Filters" [ref=e50] [cursor=pointer]:
          - generic [ref=e51]: Filters
          - img [ref=e52]
        - article [ref=e56]:
          - generic [ref=e57]:
            - generic [ref=e58]:
              - generic [ref=e61]: Web
              - generic [ref=e62]:
                - heading "Pocket Pantry" [level=3] [ref=e63]
                - paragraph [ref=e65]: A meal planning tool that helps users turn pantry items into realistic weekly dinners.
            - link "View test" [ref=e67] [cursor=pointer]:
              - /url: /test/submission-pantry
              - text: View test
              - img [ref=e68]
      - dialog "What platforms can you reliably access?" [ref=e70]:
        - generic [ref=e71]:
          - generic [ref=e72]:
            - generic [ref=e73]:
              - heading "What platforms can you reliably access?" [level=2] [ref=e74]:
                - generic [ref=e75]:
                  - img [ref=e76]
                  - generic [ref=e88]: What platforms can you reliably access?
              - paragraph [ref=e89]:
                - generic [ref=e90]: It's important to keep your preferences up to date so it's easy to test back other users.
            - button "Close" [active] [ref=e91] [cursor=pointer]:
              - img [ref=e92]
          - generic [ref=e95]:
            - img
            - group "Platforms you can test" [ref=e96]:
              - generic [ref=e97]: Platforms you can test
              - generic [ref=e98] [cursor=pointer]:
                - checkbox "Websites" [checked] [ref=e99]
                - generic [ref=e102]:
                  - img [ref=e104]
                  - generic [ref=e109]: Websites
                  - img [ref=e111]
              - generic [ref=e113] [cursor=pointer]:
                - checkbox "iOS" [ref=e114]
                - generic [ref=e117]:
                  - img [ref=e119]
                  - generic [ref=e121]: iOS
              - generic [ref=e122] [cursor=pointer]:
                - checkbox "Android" [ref=e123]
                - generic [ref=e126]:
                  - img [ref=e128]
                  - generic [ref=e130]: Android
          - generic [ref=e132]:
            - paragraph [ref=e133]:
              - img [ref=e134]
              - generic [ref=e136]: You can update this anytime.
            - button "Save preferences" [ref=e137] [cursor=pointer]:
              - text: Save preferences
              - img [ref=e138]
```

# Test source

```ts
  81  |   "components-feedback--toast-danger-state",
  82  |   "components-overlays--dialog-open-state",
  83  |   "components-overlays--drawer-open-state",
  84  |   "components-overlays--popover-open-state",
  85  |   "components-overlays--tooltip-open-state",
  86  | ];
  87  | 
  88  | const stories = [...representativeStories, ...contractStories, ...explicitStateStories];
  89  | 
  90  | const viewportScreenshotStories = new Set([
  91  |   "components-feedback--toast-contract",
  92  |   "components-feedback--toast-info-state",
  93  |   "components-feedback--toast-warning-state",
  94  |   "components-feedback--toast-danger-state",
  95  |   "components-navigation--mobile-navigation-drawer-open-state",
  96  |   "components-overlays--dialog-open-state",
  97  |   "components-overlays--drawer-open-state",
  98  | ]);
  99  | 
  100 | const viewports = [
  101 |   { name: "mobile", width: 390, height: 844 },
  102 |   { name: "tablet", width: 768, height: 1024 },
  103 |   { name: "laptop", width: 1024, height: 768 },
  104 |   { name: "desktop", width: 1440, height: 900 },
  105 | ];
  106 | 
  107 | test.beforeEach(async ({ page }) => {
  108 |   await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  109 |     throw new Error(`Visual tests must not contact Supabase: ${route.request().url()}`);
  110 |   });
  111 | });
  112 | 
  113 | async function settleRouteImages(page: Page) {
  114 |   const images = page.locator("main img");
  115 |   const count = await images.count();
  116 |   // Eager images in moving tracks already load without scrolling. Waiting for
  117 |   // their geometry to settle would hang on a continuously animated carousel.
  118 |   const lazyImages = page.locator('main img[loading="lazy"]:visible');
  119 |   for (let index = 0; index < (await lazyImages.count()); index += 1) {
  120 |     await lazyImages.nth(index).scrollIntoViewIfNeeded();
  121 |   }
  122 |   if (count > 0) {
  123 |     await expect
  124 |       .poll(
  125 |         () =>
  126 |           images.evaluateAll((elements) =>
  127 |             elements.every(
  128 |               (element) =>
  129 |                 element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
  130 |             ),
  131 |           ),
  132 |         { message: "All route images should finish decoding before visual capture" },
  133 |       )
  134 |       .toBe(true);
  135 |     await page.evaluate(() => window.scrollTo(0, 0));
  136 |   }
  137 | 
  138 |   const homeHeroPanel = page.getByTestId("home-hero-panel");
  139 |   if ((await homeHeroPanel.count()) > 0) {
  140 |     const backgroundImageUrl = await homeHeroPanel.evaluate((element) => {
  141 |       const backgroundImage = window.getComputedStyle(element).backgroundImage;
  142 |       return backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] ?? null;
  143 |     });
  144 | 
  145 |     if (backgroundImageUrl) {
  146 |       await page.evaluate(async (source) => {
  147 |         const image = new Image();
  148 |         image.src = source;
  149 |         await image.decode();
  150 |       }, backgroundImageUrl);
  151 |     }
  152 |   }
  153 | }
  154 | 
  155 | for (const story of stories) {
  156 |   for (const viewport of viewports) {
  157 |     test(`${story} at ${viewport.name}`, async ({ page }) => {
  158 |       await page.setViewportSize({ width: viewport.width, height: viewport.height });
  159 |       await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  160 |       await page.waitForLoadState("networkidle");
  161 |       const screenshotName = `${story}-${viewport.name}.png`;
  162 |       const options = { animations: "disabled" as const };
  163 | 
  164 |       if (viewportScreenshotStories.has(story)) {
  165 |         await expect(page).toHaveScreenshot(screenshotName, options);
  166 |       } else {
  167 |         await expect(page.locator("#storybook-root")).toHaveScreenshot(screenshotName, options);
  168 |       }
  169 |     });
  170 |   }
  171 | }
  172 | 
  173 | for (const route of renderableRouteStates) {
  174 |   for (const viewport of viewports) {
  175 |     test(`${route.name} route at ${viewport.name}`, async ({ page }) => {
  176 |       await page.setViewportSize({ width: viewport.width, height: viewport.height });
  177 |       await page.goto(`http://127.0.0.1:4173${route.path}`);
  178 |       await page.waitForLoadState("domcontentloaded");
  179 |       await expect(page.locator("main")).toBeVisible();
  180 |       await settleRouteImages(page);
> 181 |       await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
      |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  182 |         animations: "disabled",
  183 |         fullPage: true,
  184 |       });
  185 |     });
  186 |   }
  187 | }
  188 | 
```