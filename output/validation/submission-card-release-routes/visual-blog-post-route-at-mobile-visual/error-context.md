# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> blog-post route at mobile
- Location: tests\playwright\visual.spec.ts:175:5

# Error details

```
Error: All route images should finish decoding before visual capture

All route images should finish decoding before visual capture

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
    - article [ref=e21]:
      - link "Blog" [ref=e22] [cursor=pointer]:
        - /url: /blog
        - img [ref=e23]
        - text: Blog
      - generic [ref=e25]:
        - generic [ref=e26]:
          - time [ref=e27]: Jun 18, 2026
          - generic [ref=e28]: 5 min read
        - heading "Top 5 Free User Testing Platforms in 2026" [level=1] [ref=e29]
        - paragraph [ref=e30]: An every day founder guide to five free user testing platforms that give you real user feedback.
      - generic [ref=e31]:
        - paragraph [ref=e32]: With the rise of AI-generated apps and websites, it is no surprise why founders are clinging to human feedback. The question is no longer, "How can I build xyz?" It is, "What even should I build?"
        - paragraph [ref=e33]:
          - text: However, if you are not an enterprise, you probably realize how hard it is to get real user feedback. The most popular site,
          - link "UserTesting.com" [ref=e34] [cursor=pointer]:
            - /url: https://www.usertesting.com/
          - text: ", will not even let you sign up without speaking to their enterprise sales team. Or, you can spend $250 to get started on"
          - link "Maze.co" [ref=e35] [cursor=pointer]:
            - /url: https://maze.co/
          - text: ", which equates to 2 moderated tests. And you will also need a $99/month subscription to use simple tools, like screen recording."
        - paragraph [ref=e36]: Let's say you already found the perfect product-market fit. If your app is poorly designed or looks AI-generated, users are not going to recommend your product to their friends and family. They will also be reluctant to give helpful feedback.
        - paragraph [ref=e37]: So...
        - paragraph [ref=e38]: Here are my favorite free user testing platforms to help get your app off the ground.
        - heading "Test4Test - The best free usability testing platform" [level=2] [ref=e39]
        - figure [ref=e40]:
          - img "Test4Test homepage for its recording-first usability testing experience." [ref=e41]
        - paragraph [ref=e42]:
          - link "Test4Test" [ref=e43] [cursor=pointer]:
            - /url: https://test4test.io/
          - text: "is the only platform that gives you access to a whole community of testers for free. It also gives you access to the most impactful user testing tool: screen recordings."
        - paragraph [ref=e44]: The tester community on Test4Test is supported by an advanced test-back and satisfaction rating system. You earn credits by testing other users' apps and websites. 1 credit = 1 test. There is no middleman that profits from your efforts. When you complete a test, your test moves up the ranks and is seen by more testers. Also, if you receive good feedback, your test will also move up the ranks.
        - paragraph [ref=e45]: Screen recordings let you see how users actually use your app firsthand. Most services charge for this. With Test4Test, it is 100% free. No trials. No credit card. No limits! This is one of the most important parts of usability testing, and any senior UX researcher will repeat this.
        - paragraph [ref=e46]: Test4Test does not currently offer a paid version, so take advantage while you can.
        - heading "Userbrain" [level=2] [ref=e47]
        - figure [ref=e48]:
          - img "Userbrain dashboard showing a list of recorded user testing sessions." [ref=e49]
        - paragraph [ref=e50]:
          - link "Userbrain" [ref=e51] [cursor=pointer]:
            - /url: https://www.userbrain.com/en/
          - text: is a well-kept secret! It is not as popular as sites like
          - link "UserTesting" [ref=e52] [cursor=pointer]:
            - /url: https://www.usertesting.com/
          - text: or
          - link "Userlytics" [ref=e53] [cursor=pointer]:
            - /url: https://www.userlytics.com/
          - text: . However, they offer 2 free unmoderated usability tests without any payment necessary. It was shocking how fast I received feedback. I added a few screeners, and within 5-10 minutes, I had two 40-year-old men trying out my app. The feedback was great too.
        - paragraph [ref=e54]: They have other features, like bringing up to 100 of your own users, AI user testing, user testing templates, and the ability to test websites, prototypes, and mobile apps.
        - heading "Lookback | lookback.com" [level=2] [ref=e55]
        - figure [ref=e56]:
          - img "Lookback homepage showing its user research product positioning." [ref=e57]
        - paragraph [ref=e58]:
          - link "Lookback" [ref=e59] [cursor=pointer]:
            - /url: https://www.lookback.com/
          - text: offers a lot of variety. They have a generous 60-day free trial. This includes moderated, unmoderated, user research, and other UX research tools.
        - paragraph [ref=e60]: However, once the free trial runs out, it is $25/month for a limited plan and $344/month for the normal plan. This will give you 300 sessions, but most startups do not need that many, especially if you are just starting out.
        - heading "Lyssna" [level=2] [ref=e61]
        - figure [ref=e62]:
          - img "Lyssna homepage presenting the user research platform." [ref=e63]
        - paragraph [ref=e64]:
          - link "Lyssna" [ref=e65] [cursor=pointer]:
            - /url: https://www.lyssna.com/
          - text: ", formerly"
          - link "UsabilityHub" [ref=e66] [cursor=pointer]:
            - /url: https://www.usabilityhub.com/
          - text: ", lets you run unique usability tests, like first-click and five-second tests. You also have access to surveys, preference tests, and more tools to get a better understanding of your users' intent."
        - paragraph [ref=e67]: All tests under 2 minutes are free. However, you have to bring your own testers, and setup is quite complicated. If you are able to get something up and running, you will be limited by not having screen or audio recordings. Also, running surveys is $1 per answer. That is not cheap when you have hundreds of answers.
        - heading "Listen Labs" [level=2] [ref=e68]
        - figure:
          - img "Listen Labs product page describing qualitative interviews and quantitative surveys."
        - paragraph [ref=e69]:
          - link "Listen Labs" [ref=e70] [cursor=pointer]:
            - /url: https://listenlabs.ai/
          - text: recently raised $100M in
          - link "Series B funding" [ref=e71] [cursor=pointer]:
            - /url: https://listenlabs.ai/founders-letter
          - text: as a fast-growing user research company. It automates user interviews by recruiting from a massive user pool and interviewing them live.
        - paragraph [ref=e72]: New users get 5 free AI-moderated interviews. I was shocked by how fast it found live people to talk about pain points and to bounce ideas off of. Creating the research study was also very quick and easy with the help of AI agents guiding me through everything.
        - paragraph [ref=e73]: The results came back in 5 minutes. I am not joking. Within seconds, it was already interviewing live participants that were screened and fit my ideal user persona. The interviews can be viewed raw, or it does a great job of summarizing the results.
        - paragraph [ref=e74]: I highly recommend Listen Labs. It is great for enterprises and startups alike. I felt like I was not missing any features. And if I decide to keep using it, I can pay per test at a very affordable rate.
        - heading "Which free user testing platform should you choose?" [level=2] [ref=e75]
        - paragraph [ref=e76]: In conclusion, Test4Test takes the cake for accessing a large tester community and accessing a live recording feature within seconds of signing up. Userbrain is not far behind. They offer two free unmoderated user testing sessions, and you do not have to pay at all. Lastly, Listen Labs is extremely useful for primary research. Although it does not offer user recordings yet, conducting automated AI interviews with real participants in seconds is honestly amazing.
      - region "Try Test4Test" [ref=e77]:
        - link "Try Test4Test Now ->" [ref=e78] [cursor=pointer]:
          - /url: https://test4test.io
  - contentinfo [ref=e79]:
    - generic [ref=e81]:
      - generic [ref=e82]:
        - link "Test4Test home" [ref=e83] [cursor=pointer]:
          - /url: /
          - img [ref=e84]
          - generic [ref=e87]: Test4Test
        - paragraph [ref=e88]: © 2026 Test4Test. All rights reserved.
      - navigation "Product" [ref=e89]:
        - heading "Product" [level=2] [ref=e90]
        - list [ref=e91]:
          - listitem [ref=e92]:
            - link "Get your app tested" [ref=e93] [cursor=pointer]:
              - /url: /submit
          - listitem [ref=e94]:
            - link "Get paid to test" [ref=e95] [cursor=pointer]:
              - /url: /get-paid-to-test
          - listitem [ref=e96]:
            - link "Blog" [ref=e97] [cursor=pointer]:
              - /url: /blog
          - listitem [ref=e98]:
            - link "Sign in" [ref=e99] [cursor=pointer]:
              - /url: /sign-in
      - generic [ref=e100]:
        - heading "Support" [level=2] [ref=e101]
        - link "support@test4test.io" [ref=e102] [cursor=pointer]:
          - /url: mailto:support@test4test.io
```

# Test source

```ts
  34  |   "components-layout--stack-contract",
  35  |   "components-layout--cluster-contract",
  36  |   "components-layout--grid-contract",
  37  |   "components-layout--divider-contract",
  38  |   "components-layout--section-contract",
  39  |   "components-layout--bento-grid-contract",
  40  |   "components-layout--application-shell-contract",
  41  |   "components-navigation--top-navigation-contract",
  42  |   "components-navigation--mobile-navigation-drawer-contract",
  43  |   "components-navigation--tabs-contract",
  44  |   "components-navigation--breadcrumb-contract",
  45  |   "components-navigation--pagination-contract",
  46  |   "components-navigation--menu-contract",
  47  |   "components-feedback--alert-contract",
  48  |   "components-feedback--toast-contract",
  49  |   "components-feedback--inline-validation-contract",
  50  |   "components-feedback--form-summary-contract",
  51  |   "components-feedback--progress-contract",
  52  |   "components-feedback--skeleton-contract",
  53  |   "components-feedback--empty-state-contract",
  54  |   "components-overlays--dialog-contract",
  55  |   "components-overlays--drawer-contract",
  56  |   "components-overlays--popover-contract",
  57  |   "components-overlays--tooltip-contract",
  58  |   "components-data-display--card-contract",
  59  |   "components-data-display--surface-contract",
  60  |   "components-data-display--table-contract",
  61  |   "components-data-display--list-contract",
  62  |   "components-data-display--badge-contract",
  63  |   "components-data-display--status-indicator-contract",
  64  |   "components-data-display--technical-value-contract",
  65  |   "patterns-product--page-header-contract",
  66  |   "patterns-product--stepper-contract",
  67  |   "patterns-product--rating-control-contract",
  68  |   "patterns-product--star-rating-display-contract",
  69  |   "patterns-product--recording-status-contract",
  70  |   "patterns-product--test-row-contract",
  71  |   "patterns-product--earn-test-card-contract",
  72  |   "patterns-product--question-editor-contract",
  73  |   "patterns-product--response-viewer-contract",
  74  | ];
  75  | 
  76  | const explicitStateStories = [
  77  |   "components-navigation--top-navigation-public-state",
  78  |   "components-navigation--mobile-navigation-drawer-open-state",
  79  |   "components-feedback--toast-info-state",
  80  |   "components-feedback--toast-warning-state",
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
> 134 |       .toBe(true);
      |        ^ Error: All route images should finish decoding before visual capture
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
  181 |       await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
  182 |         animations: "disabled",
  183 |         fullPage: true,
  184 |       });
  185 |     });
  186 |   }
  187 | }
  188 | 
```