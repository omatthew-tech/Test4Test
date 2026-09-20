# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> home free-feedback methods stay visible and reflow at 390px
- Location: tests\playwright\journeys.spec.ts:54:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('free-feedback-section').getByRole('heading', { level: 2 })
Timeout: 5000ms
- Expected  - 2
+ Received  + 1

  Array [
-   "Test other founders",
-   "Bring your own testers",
+   "2 paid free ways to get feedback",
  ]

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for getByTestId('free-feedback-section').getByRole('heading', { level: 2 })
    14 × locator resolved to 1 element

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
      - region "Get FREE user testing on your web or mobile app" [ref=e21]:
        - generic [ref=e24]:
          - heading "Get FREE user testing on your web or mobile app" [level=1] [ref=e25]:
            - text: Get
            - mark [ref=e26]: FREE
            - text: user testing on your web or mobile app
          - paragraph [ref=e27]: The only 100% free user testing platform with recordings and meaningful feedback guaranteed
          - generic [ref=e28]:
            - generic [ref=e29]:
              - generic [ref=e30]: App name
              - textbox "App name" [ref=e31]:
                - /placeholder: Enter your app's name
            - button "Get started" [ref=e32] [cursor=pointer]
      - region "Trusted by 4+ global startups" [ref=e33]:
        - list "Top tests available on Earn" [ref=e36]:
          - listitem [ref=e37]:
            - article [ref=e38] [cursor=pointer]:
              - generic [ref=e41]:
                - heading "Sprout Habit Open Sprout Habit test" [level=3] [ref=e42]:
                  - generic [ref=e43]:
                    - generic [ref=e45]: Sprout Habit
                    - link "Open Sprout Habit test" [ref=e46]:
                      - /url: /test/submission-sprout
                      - img [ref=e47]
                - paragraph [ref=e51]: A habit-tracking app focused on gentle accountability and daily routines.
            - generic [ref=e52]: Rank 1 of 4
          - listitem [ref=e53]:
            - article [ref=e54] [cursor=pointer]:
              - generic [ref=e57]:
                - heading "TrailMixer Open TrailMixer test" [level=3] [ref=e58]:
                  - generic [ref=e59]:
                    - generic [ref=e61]: TrailMixer
                    - link "Open TrailMixer test" [ref=e62]:
                      - /url: /test/submission-trail
                      - img [ref=e63]
                - paragraph [ref=e67]: A trip-planning companion for stitching outdoor routes, packing lists, and weather together.
            - generic [ref=e68]: Rank 2 of 4
          - listitem [ref=e69]:
            - article [ref=e70] [cursor=pointer]:
              - generic [ref=e73]:
                - heading "Pocket Pantry Open Pocket Pantry test" [level=3] [ref=e74]:
                  - generic [ref=e75]:
                    - generic [ref=e77]: Pocket Pantry
                    - link "Open Pocket Pantry test" [ref=e78]:
                      - /url: /test/submission-pantry
                      - img [ref=e79]
                - paragraph [ref=e83]: A meal planning tool that helps users turn pantry items into realistic weekly dinners.
            - generic [ref=e84]: Rank 3 of 4
          - listitem [ref=e85]:
            - article [ref=e86] [cursor=pointer]:
              - generic [ref=e89]:
                - heading "Palette Pilot Open Palette Pilot test" [level=3] [ref=e90]:
                  - generic [ref=e91]:
                    - generic [ref=e93]: Palette Pilot
                    - link "Open Palette Pilot test" [ref=e94]:
                      - /url: /test/submission-palette
                      - img [ref=e95]
                - paragraph [ref=e99]: A collaborative moodboard and creative direction workspace for design teams.
            - generic [ref=e100]: Rank 4 of 4
        - heading "Trusted by 4+ global startups" [level=2] [ref=e102]:
          - text: Trusted by 4+ global startups
          - generic [ref=e103]:
            - img [ref=e104]
            - img [ref=e106]
            - img [ref=e108]
            - img [ref=e110]
            - img [ref=e112]
      - generic [ref=e115]:
        - region "How it works" [ref=e116]:
          - generic [ref=e117]:
            - heading "How it works" [level=2] [ref=e118]
            - list [ref=e120]:
              - listitem [ref=e121]:
                - generic [ref=e122]:
                  - heading "Create your test" [level=3] [ref=e123]
                  - paragraph [ref=e124]: Create your first test in seconds. Answer a few questions or use AI
              - listitem [ref=e125]:
                - generic [ref=e126]:
                  - heading "Get testers" [level=3] [ref=e127]
                  - paragraph [ref=e128]: Share your test to unlimited users or earn credits by testing other founder's tests
              - listitem [ref=e129]:
                - generic [ref=e130]:
                  - heading "Gain insights" [level=3] [ref=e131]
                  - paragraph [ref=e132]: Manage every insight from one dashboard. Watch your tests, clip or export it to your favorite LLM
        - region "2 free ways to get feedback" [ref=e133]:
          - generic [ref=e134]:
            - heading "2 free ways to get feedback" [level=2] [ref=e135]: 2 paid free ways to get feedback
            - generic [ref=e136]:
              - article "Earn 1:1 credits" [ref=e137]:
                - img [ref=e139]
                - generic [ref=e140]:
                  - heading "Earn 1:1 credits" [level=3] [ref=e141]
                  - paragraph [ref=e142]: Earn credits 1:1 (we don't take a cut)
              - article "Bring your own testers" [ref=e143]:
                - img [ref=e145]
                - generic [ref=e146]:
                  - heading "Bring your own testers" [level=3] [ref=e147]
                  - paragraph [ref=e148]: There are no limits - bring as many as you want
        - region "If you can link to it, you can test it" [ref=e149]:
          - generic [ref=e150]:
            - generic [ref=e151]:
              - heading "If you can link to it, you can test it" [level=2] [ref=e152]
              - paragraph [ref=e153]: Founders, students, UX designers, product managers, or researchers — Test4Test makes getting valuable insights free and easy
            - generic [ref=e154]:
              - article [ref=e155]:
                - img [ref=e157]
                - generic [ref=e160]:
                  - heading "Websites" [level=3] [ref=e161]
                  - paragraph [ref=e162]: Test live websites, sites in development, password-protected pages, and even competitors’ sites
              - article [ref=e163]:
                - img [ref=e165]
                - generic [ref=e167]:
                  - heading "Prototypes" [level=3] [ref=e168]
                  - paragraph [ref=e169]: Test any prototype with a link — Figma, Adobe XD, Axure, Sketch, Balsamiq, and others
              - article [ref=e170]:
                - generic [ref=e172]:
                  - img [ref=e173]
                  - img [ref=e175]
                - generic [ref=e177]:
                  - heading "Mobile apps" [level=3] [ref=e178]
                  - paragraph [ref=e179]: Test mobile apps on Android or iOS. Whether they're published or still in beta
        - region "Go Wild" [ref=e180]:
          - generic [ref=e181]:
            - generic [ref=e183]:
              - heading "Go Wild" [level=2] [ref=e184]
              - paragraph [ref=e185]: Start recruiting users from social media, forums and communities
            - generic [ref=e186]:
              - article [ref=e187]:
                - img [ref=e189]
                - generic [ref=e190]:
                  - generic [ref=e191]: Other platforms
                  - heading "\"Users\" come from pools" [level=3] [ref=e192]
                  - paragraph [ref=e193]: Most users are professional survey takers, trained to get past screeners
              - article [ref=e194]:
                - img [ref=e196]
                - generic [ref=e197]:
                  - generic [ref=e198]:
                    - generic [ref=e199]: Test4Test
                    - heading "Recruit REAL users" [level=3] [ref=e200]
                    - paragraph [ref=e201]: Recruit users who actually experience the problem you're trying to solve
                  - button "Try Test4Test Premium" [ref=e202] [cursor=pointer]:
                    - text: Try Test4Test Premium
                    - img [ref=e203]
        - region "Ready for feedback?" [ref=e205]:
          - generic [ref=e206]:
            - heading "Ready for feedback?" [level=2] [ref=e207]
            - paragraph [ref=e208]: It takes minutes to submit your app. Start seeing real user feedback today!
            - button "Get started" [ref=e210] [cursor=pointer]:
              - text: Get started
              - img [ref=e211]
  - contentinfo [ref=e213]:
    - generic [ref=e215]:
      - generic [ref=e216]:
        - link "Test4Test home" [ref=e217] [cursor=pointer]:
          - /url: /
          - img [ref=e218]
          - generic [ref=e221]: Test4Test
        - paragraph [ref=e222]: © 2026 Test4Test. All rights reserved.
      - navigation "Product" [ref=e223]:
        - heading "Product" [level=2] [ref=e224]
        - list [ref=e225]:
          - listitem [ref=e226]:
            - link "Get your app tested" [ref=e227] [cursor=pointer]:
              - /url: /submit
          - listitem [ref=e228]:
            - link "Get paid to test" [ref=e229] [cursor=pointer]:
              - /url: /get-paid-to-test
          - listitem [ref=e230]:
            - link "Blog" [ref=e231] [cursor=pointer]:
              - /url: /blog
          - listitem [ref=e232]:
            - link "Sign in" [ref=e233] [cursor=pointer]:
              - /url: /sign-in
      - generic [ref=e234]:
        - heading "Support" [level=2] [ref=e235]
        - link "support@test4test.io" [ref=e236] [cursor=pointer]:
          - /url: mailto:support@test4test.io
```

# Test source

```ts
  1   | import AxeBuilder from "@axe-core/playwright";
  2   | import { expect, test } from "@playwright/test";
  3   | 
  4   | const homeFeedbackQuotes = [
  5   |   "“I knew exactly what to do next”",
  6   |   "“The save button was easy to miss”",
  7   |   "“The sign-up flow felt quick”",
  8   |   "“I wanted clearer pricing”",
  9   |   "“The navigation made sense”",
  10  |   "“I wasn’t sure my changes saved”",
  11  |   "“The page felt fast and focused”",
  12  |   "“I’d make the main action stand out”",
  13  | ] as const;
  14  | 
  15  | test.beforeEach(async ({ page }) => {
  16  |   await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  17  |     throw new Error(`Design-system journeys must not contact Supabase: ${route.request().url()}`);
  18  |   });
  19  | });
  20  | 
  21  | test("selected Get paid to test navigation returns to the home page", async ({ page }) => {
  22  |   await page.setViewportSize({ width: 1440, height: 900 });
  23  |   await page.goto("/get-paid-to-test");
  24  | 
  25  |   const selectedLink = page
  26  |     .getByRole("navigation", { name: "Primary" })
  27  |     .getByRole("link", { name: "Get paid to test" });
  28  |   await expect(selectedLink).toHaveAttribute("aria-current", "page");
  29  |   await selectedLink.click();
  30  | 
  31  |   await expect(page).toHaveURL("/");
  32  |   await expect(
  33  |     page
  34  |       .getByRole("navigation", { name: "Primary" })
  35  |       .getByRole("link", { name: "Get paid to test" }),
  36  |   ).not.toHaveAttribute("aria-current", "page");
  37  | });
  38  | 
  39  | test("home starts a named submission without losing the draft", async ({ page }) => {
  40  |   await page.goto("/");
  41  |   await page.getByRole("textbox", { name: "App name" }).fill("Checkout audit");
  42  |   await page
  43  |     .getByRole("region", { name: "Get free user testing on your web or mobile app" })
  44  |     .getByRole("button", { name: "Get started" })
  45  |     .click();
  46  |   await expect(page).toHaveURL(/\/submit(?:\?|$)/);
  47  |   await expect(page.getByRole("textbox", { name: "App name" })).toHaveValue("Checkout audit");
  48  | });
  49  | 
  50  | for (const viewport of [
  51  |   { width: 1440, height: 900 },
  52  |   { width: 390, height: 844 },
  53  | ]) {
  54  |   test(`home free-feedback methods stay visible and reflow at ${viewport.width}px`, async ({
  55  |     page,
  56  |   }) => {
  57  |     await page.setViewportSize(viewport);
  58  |     await page.emulateMedia({ reducedMotion: "reduce" });
  59  |     await page.goto("/");
  60  | 
  61  |     const section = page.getByTestId("free-feedback-section");
  62  |     const methods = section.getByRole("article");
  63  |     await expect(methods).toHaveCount(2);
> 64  |     await expect(section.getByRole("heading", { level: 2 })).toHaveText([
      |                                                              ^ Error: expect(locator).toHaveText(expected) failed
  65  |       "Test other founders",
  66  |       "Bring your own testers",
  67  |     ]);
  68  |     await expect(section.locator("p")).toHaveText([
  69  |       "Earn credits 1:1 (we don't take a cut)",
  70  |       "There are no limits - bring as many as you want",
  71  |     ]);
  72  |     await expect(section.getByRole("button")).toHaveCount(0);
  73  |     await expect(section.getByRole("link")).toHaveCount(0);
  74  |     await expect(section.getByText("2 free ways to get feedback")).toHaveCount(0);
  75  | 
  76  |     for (let index = 0; index < 2; index += 1) {
  77  |       const method = methods.nth(index);
  78  |       const illustration = method.locator("img");
  79  |       await illustration.scrollIntoViewIfNeeded();
  80  |       await expect(illustration).toHaveJSProperty("complete", true);
  81  |       await expect
  82  |         .poll(() => illustration.evaluate((image) => (image as HTMLImageElement).naturalWidth))
  83  |         .toBeGreaterThan(0);
  84  |       const imageBounds = await illustration.boundingBox();
  85  |       const copyBounds = await method.getByRole("heading").boundingBox();
  86  |       expect(imageBounds).not.toBeNull();
  87  |       expect(copyBounds).not.toBeNull();
  88  |       if (!imageBounds || !copyBounds) throw new Error("Feedback method is not visible");
  89  |       expect(imageBounds.x).toBeGreaterThanOrEqual(0);
  90  |       expect(imageBounds.x + imageBounds.width).toBeLessThanOrEqual(viewport.width);
  91  |       if (viewport.width < 768) {
  92  |         expect(copyBounds.y).toBeGreaterThan(imageBounds.y + imageBounds.height);
  93  |       } else if (index === 0) {
  94  |         expect(copyBounds.x).toBeGreaterThan(imageBounds.x + imageBounds.width);
  95  |       } else {
  96  |         expect(imageBounds.x).toBeGreaterThan(copyBounds.x + copyBounds.width);
  97  |       }
  98  |     }
  99  |   });
  100 | }
  101 | 
  102 | test("home managed recruitment follows the free-feedback showcase and uses animated media", async ({
  103 |   page,
  104 | }) => {
  105 |   await page.setViewportSize({ width: 1440, height: 900 });
  106 |   await page.goto("/");
  107 | 
  108 |   const freeFeedbackSection = page.getByTestId("free-feedback-section");
  109 |   const testableProductsSection = page.getByTestId("home-testable-products-section");
  110 |   const managedSection = page.getByTestId("home-managed-recruitment-section");
  111 |   const images = managedSection.locator("img");
  112 | 
  113 |   await expect(
  114 |     managedSection.getByRole("heading", {
  115 |       level: 2,
  116 |       name: "Most platforms give you tools. We go find the people.",
  117 |     }),
  118 |   ).toBeVisible();
  119 |   await expect(managedSection.getByRole("heading", { level: 3 })).toHaveCount(2);
  120 |   await expect(managedSection.getByRole("button", { name: "Try Test4Test Premium" })).toBeVisible();
  121 |   await expect(managedSection.getByText("Pause animations", { exact: true })).toHaveCount(0);
  122 |   await expect(images.nth(0)).toHaveAttribute("src", "/images/animations/monkey-typing-loop.webp");
  123 |   await expect(images.nth(1)).toHaveAttribute("src", "/images/animations/monkey-vine-loop.webp");
  124 | 
  125 |   await expect(freeFeedbackSection.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
  126 |     "data-testid",
  127 |     "home-testable-products-section",
  128 |   );
  129 |   await expect(testableProductsSection.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
  130 |     "data-testid",
  131 |     "home-managed-recruitment-section",
  132 |   );
  133 | });
  134 | 
  135 | test("home managed recruitment uses static posters for reduced motion", async ({ page }) => {
  136 |   await page.emulateMedia({ reducedMotion: "reduce" });
  137 |   await page.goto("/");
  138 | 
  139 |   const managedSection = page.getByTestId("home-managed-recruitment-section");
  140 |   await expect(managedSection.getByText("Pause animations", { exact: true })).toHaveCount(0);
  141 |   await expect(
  142 |     managedSection.locator('source[media="(prefers-reduced-motion: reduce)"]'),
  143 |   ).toHaveCount(2);
  144 | });
  145 | 
  146 | test("home Trusted by section shows six Earn cards in an accessible horizontal loop", async ({
  147 |   page,
  148 | }, testInfo) => {
  149 |   await page.setViewportSize({ width: 1440, height: 900 });
  150 |   await page.goto("/?ds-home-trusted=1");
  151 | 
  152 |   const section = page.getByTestId("home-trusted-by-section");
  153 |   const track = page.getByTestId("home-trusted-by-track");
  154 |   const list = section.getByRole("list", { name: "Top tests available on Earn" });
  155 | 
  156 |   await expect(
  157 |     section.getByRole("heading", {
  158 |       level: 2,
  159 |       name: /^Trusted by \d[\d,]*\+ global startups$/,
  160 |     }),
  161 |   ).toBeVisible();
  162 |   await expect(list.getByRole("article")).toHaveCount(6);
  163 |   const logos = list.getByTestId("home-trusted-logo");
  164 |   await expect(logos).toHaveCount(6);
```