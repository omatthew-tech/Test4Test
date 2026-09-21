# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> earn route at laptop
- Location: tests\playwright\visual.spec.ts:175:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  Expected an image 1024px by 864px, received 1024px by 768px. 23710 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: earn-laptop.png

Call log:
  - Expect "toHaveScreenshot(earn-laptop.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - Expected an image 1024px by 864px, received 1024px by 768px. 23710 pixels (ratio 0.03 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - Expected an image 1024px by 864px, received 1024px by 768px. 23710 pixels (ratio 0.03 of all image pixels) are different.

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
      - navigation "Primary" [ref=e15]:
        - link "Earn" [ref=e16] [cursor=pointer]:
          - /url: /earn
        - link "Share" [ref=e17] [cursor=pointer]:
          - /url: /share
        - link "Analyze" [ref=e18] [cursor=pointer]:
          - /url: /analytics
      - button "Profile menu" [ref=e21] [cursor=pointer]:
        - img [ref=e22]
  - main [ref=e25]:
    - generic [ref=e27]:
      - generic [ref=e28]:
        - heading "Earn" [level=1] [ref=e29]
        - generic [ref=e30]:
          - heading "Loading your visibility" [level=2] [ref=e33]
          - generic "Earn visibility metrics" [ref=e34]:
            - generic [ref=e35]:
              - img
              - strong [ref=e37]:
                - generic [ref=e38]: Rank
                - text: ...
              - button "How Earn ranking works" [ref=e41] [cursor=pointer]:
                - img [ref=e42]
              - generic [ref=e44]: Loading Rank
            - generic [ref=e45]:
              - generic [ref=e46]:
                - strong [ref=e47]: ...
                - generic [ref=e48]: Test-back rate
              - generic [ref=e49]:
                - strong [ref=e50]: ...
                - generic [ref=e51]: Satisfaction rate
              - generic [ref=e52]:
                - strong [ref=e53]: ...
                - generic [ref=e54]: Credits
        - button "Filters" [ref=e57] [cursor=pointer]:
          - generic [ref=e58]: Filters
          - img [ref=e59]
        - article [ref=e63]:
          - generic [ref=e64]:
            - generic [ref=e65]:
              - generic [ref=e68]: Web
              - generic [ref=e69]:
                - heading "Pocket Pantry" [level=3] [ref=e70]
                - paragraph [ref=e72]: A meal planning tool that helps users turn pantry items into realistic weekly dinners.
            - link "View test" [ref=e74] [cursor=pointer]:
              - /url: /test/submission-pantry
              - text: View test
              - img [ref=e75]
      - dialog "What platforms can you reliably access?" [ref=e77]:
        - generic [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e80]:
              - heading "What platforms can you reliably access?" [level=2] [ref=e81]:
                - generic [ref=e82]:
                  - img [ref=e83]
                  - generic [ref=e95]: What platforms can you reliably access?
              - paragraph [ref=e96]:
                - generic [ref=e97]: It's important to keep your preferences up to date so it's easy to test back other users.
            - button "Close" [active] [ref=e98] [cursor=pointer]:
              - img [ref=e99]
          - generic [ref=e102]:
            - img
            - group "Platforms you can test" [ref=e103]:
              - generic [ref=e104]: Platforms you can test
              - generic [ref=e105] [cursor=pointer]:
                - checkbox "Websites" [checked] [ref=e106]
                - generic [ref=e109]:
                  - img [ref=e111]
                  - generic [ref=e116]: Websites
                  - img [ref=e118]
              - generic [ref=e120] [cursor=pointer]:
                - checkbox "iOS" [ref=e121]
                - generic [ref=e124]:
                  - img [ref=e126]
                  - generic [ref=e128]: iOS
              - generic [ref=e129] [cursor=pointer]:
                - checkbox "Android" [ref=e130]
                - generic [ref=e133]:
                  - img [ref=e135]
                  - generic [ref=e137]: Android
          - generic [ref=e139]:
            - paragraph [ref=e140]:
              - img [ref=e141]
              - generic [ref=e143]: You can update this anytime.
            - button "Save preferences" [ref=e144] [cursor=pointer]:
              - text: Save preferences
              - img [ref=e145]
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