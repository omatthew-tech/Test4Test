# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> recording-view route at desktop
- Location: tests\playwright\visual.spec.ts:173:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  Expected an image 1440px by 983px, received 1440px by 963px. 

  Snapshot: recording-view-desktop.png

Call log:
  - Expect "toHaveScreenshot(recording-view-desktop.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - Expected an image 1440px by 983px, received 1440px by 963px.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - Expected an image 1440px by 983px, received 1440px by 963px.

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
    - generic [ref=e28]:
      - generic [ref=e29]:
        - paragraph [ref=e30]: Recording 1 of 2
        - heading "Palette Pilot" [level=1] [ref=e31]
        - paragraph [ref=e32]: Mar 26, 10:40 AM
      - generic [ref=e33]:
        - button "Previous recording" [disabled] [ref=e34]:
          - img [ref=e35]
        - 'generic "Recording 1 of 2: Palette Pilot" [ref=e38]': Your browser does not support embedded video playback.
        - button "Next recording" [ref=e39] [cursor=pointer]:
          - img [ref=e40]
        - generic [ref=e42]:
          - generic [ref=e44]:
            - generic [ref=e45]:
              - group "Rate video" [ref=e46]:
                - generic [ref=e47]: Rate video
                - generic [ref=e48]:
                  - radio "1 star" [ref=e49]
                  - generic [ref=e50] [cursor=pointer]:
                    - img [ref=e51]
                    - generic [ref=e53]: 1 star
                - generic [ref=e54]:
                  - radio "2 stars" [ref=e55]
                  - generic [ref=e56] [cursor=pointer]:
                    - img [ref=e57]
                    - generic [ref=e59]: 2 stars
                - generic [ref=e60]:
                  - radio "3 stars" [ref=e61]
                  - generic [ref=e62] [cursor=pointer]:
                    - img [ref=e63]
                    - generic [ref=e65]: 3 stars
                - generic [ref=e66]:
                  - radio "4 stars" [ref=e67]
                  - generic [ref=e68] [cursor=pointer]:
                    - img [ref=e69]
                    - generic [ref=e71]: 4 stars
                - generic [ref=e72]:
                  - radio "5 stars" [ref=e73]
                  - generic [ref=e74] [cursor=pointer]:
                    - img [ref=e75]
                    - generic [ref=e77]: 5 stars
              - paragraph [ref=e78]: Optional. Stars contribute to tester reputation. This rating applies to the current recording. Choose a star, then select Submit to save your rating.
              - status [ref=e79]
            - generic [ref=e80]:
              - button "Tip" [ref=e81] [cursor=pointer]:
                - img [ref=e82]
                - text: Tip
              - button "Message" [ref=e87] [cursor=pointer]:
                - img [ref=e88]
                - text: Message
              - button "Share" [ref=e90] [cursor=pointer]:
                - img [ref=e91]
                - text: Share
          - region "Recording transcript" [ref=e97]:
            - generic [ref=e99]:
              - paragraph [ref=e100]: Transcript unavailable
              - paragraph [ref=e101]: A transcript has not been added for this recording. Video playback is still available above.
```

# Test source

```ts
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
  165 |         await expect(page.locator("#storybook-root")).toHaveScreenshot(screenshotName, options);
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
> 179 |       await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
      |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  180 |         animations: "disabled",
  181 |         fullPage: true,
  182 |       });
  183 |     });
  184 |   }
  185 | }
  186 | 
```