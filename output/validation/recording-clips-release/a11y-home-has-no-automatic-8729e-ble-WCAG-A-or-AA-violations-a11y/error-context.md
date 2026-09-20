# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a11y.spec.ts >> home has no automatically detectable WCAG A or AA violations
- Location: tests\playwright\a11y.spec.ts:57:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 181

- Array []
+ Array [
+   Object {
+     "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
+     "help": "Elements must meet minimum color contrast ratio thresholds",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/color-contrast?application=playwright",
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#899095",
+               "fontSize": "12.0pt (16px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<article class=\"_surface_b935g_928 _surfaceToneDefault_b935g_933 _surfacePaddingNone_b935g_946 _earnTestCard_b935g_1276 _trustedByCard_1hnwd_128\">",
+                 "target": Array [
+                   "._trustedByDuplicate_1hnwd_990 > ._trustedByItem_1hnwd_121:nth-child(6) > ._surface_b935g_928._surfaceToneDefault_b935g_933._surfacePaddingNone_b935g_946",
+                 ],
+               },
+               Object {
+                 "html": "<div class=\"_applicationShell_b935g_314 _shell_e4hc6_1 _marketing_e4hc6_12\" data-route=\"/\">",
+                 "target": Array [
+                   "._applicationShell_b935g_314",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<p>A mobile field-research companion for capturing observations on the go.</p>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "._trustedByDuplicate_1hnwd_990 > ._trustedByItem_1hnwd_121:nth-child(6) > ._surface_b935g_928._surfaceToneDefault_b935g_933._surfacePaddingNone_b935g_946 > ._earnTestCardContent_b935g_1284 > ._earnTestCardMain_b935g_1292 > ._earnTestCardHead_b935g_1327 > p",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#899095",
+               "fontSize": "12.0pt (16px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<article class=\"_surface_b935g_928 _surfaceToneDefault_b935g_933 _surfacePaddingNone_b935g_946 _earnTestCard_b935g_1276 _trustedByCard_1hnwd_128\">",
+                 "target": Array [
+                   "ol[aria-label=\"Top tests available on Earn\"] > ._trustedByItem_1hnwd_121:nth-child(1) > ._surface_b935g_928._surfaceToneDefault_b935g_933._surfacePaddingNone_b935g_946",
+                 ],
+               },
+               Object {
+                 "html": "<div class=\"_applicationShell_b935g_314 _shell_e4hc6_1 _marketing_e4hc6_12\" data-route=\"/\">",
+                 "target": Array [
+                   "._applicationShell_b935g_314",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<p>A habit-tracking app focused on gentle accountability and daily routines.</p>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "ol[aria-label=\"Top tests available on Earn\"] > ._trustedByItem_1hnwd_121:nth-child(1) > ._surface_b935g_928._surfaceToneDefault_b935g_933._surfacePaddingNone_b935g_946 > ._earnTestCardContent_b935g_1284 > ._earnTestCardMain_b935g_1292 > ._earnTestCardHead_b935g_1327 > p",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#899095",
+               "fontSize": "12.0pt (16px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<article class=\"_surface_b935g_928 _surfaceToneDefault_b935g_933 _surfacePaddingNone_b935g_946 _earnTestCard_b935g_1276 _trustedByCard_1hnwd_128\">",
+                 "target": Array [
+                   "ol[aria-label=\"Top tests available on Earn\"] > ._trustedByItem_1hnwd_121:nth-child(2) > ._surface_b935g_928._surfaceToneDefault_b935g_933._surfacePaddingNone_b935g_946",
+                 ],
+               },
+               Object {
+                 "html": "<div class=\"_applicationShell_b935g_314 _shell_e4hc6_1 _marketing_e4hc6_12\" data-route=\"/\">",
+                 "target": Array [
+                   "._applicationShell_b935g_314",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<p>A trip-planning companion for stitching outdoor routes, packing lists, and weather together.</p>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "ol[aria-label=\"Top tests available on Earn\"] > ._trustedByItem_1hnwd_121:nth-child(2) > ._surface_b935g_928._surfaceToneDefault_b935g_933._surfacePaddingNone_b935g_946 > ._earnTestCardContent_b935g_1284 > ._earnTestCardMain_b935g_1292 > ._earnTestCardHead_b935g_1327 > p",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#899095",
+               "fontSize": "9.0pt (12px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<div class=\"_applicationShell_b935g_314 _shell_e4hc6_1 _marketing_e4hc6_12\" data-route=\"/\">",
+                 "target": Array [
+                   "._applicationShell_b935g_314",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.23 (foreground color: #899095, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<h2 class=\"_trustedByCaption_1hnwd_66\" id=\"home-trusted-by-title\">",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "#home-trusted-by-title",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2aa",
+       "wcag143",
+       "TTv5",
+       "TT13.c",
+       "EN-301-549",
+       "EN-9.1.4.3",
+       "ACT",
+       "RGAAv4",
+       "RGAA-3.2.1",
+     ],
+   },
+ ]
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
        - link "Blog" [ref=e16] [cursor=pointer]:
          - /url: /blog
        - link "Get paid to test" [ref=e17] [cursor=pointer]:
          - /url: /get-paid-to-test
      - generic [ref=e19]:
        - link "Sign in" [ref=e20] [cursor=pointer]:
          - /url: /sign-in
        - link "Get started" [ref=e21] [cursor=pointer]:
          - /url: /submit
  - main [ref=e22]:
    - generic [ref=e24]:
      - region "Get FREE user testing on your web or mobile app" [ref=e25]:
        - generic [ref=e28]:
          - heading "Get FREE user testing on your web or mobile app" [level=1] [ref=e29]:
            - text: Get
            - mark [ref=e30]: FREE
            - text: user testing on your web or mobile app
          - paragraph [ref=e31]: The only 100% free user testing platform with recordings and meaningful feedback guaranteed
          - generic [ref=e32]:
            - generic [ref=e33]:
              - generic [ref=e34]: App name
              - textbox "App name" [ref=e35]:
                - /placeholder: Enter your app's name
            - button "Get started" [ref=e36] [cursor=pointer]
      - region "Trusted by 4+ global startups" [ref=e37]:
        - generic [ref=e39]:
          - list [ref=e40]:
            - listitem [ref=e41]:
              - article [ref=e42] [cursor=pointer]:
                - generic [ref=e45]:
                  - heading [level=3] [ref=e46]:
                    - generic [ref=e47]:
                      - generic [ref=e49]: Sprout Habit
                      - link [ref=e50]:
                        - /url: /test/submission-sprout
                        - img [ref=e51]
                  - paragraph [ref=e55]: A habit-tracking app focused on gentle accountability and daily routines.
            - listitem [ref=e56]:
              - article [ref=e57] [cursor=pointer]:
                - generic [ref=e60]:
                  - heading [level=3] [ref=e61]:
                    - generic [ref=e62]:
                      - generic [ref=e64]: TrailMixer
                      - link [ref=e65]:
                        - /url: /test/submission-trail
                        - img [ref=e66]
                  - paragraph [ref=e70]: A trip-planning companion for stitching outdoor routes, packing lists, and weather together.
            - listitem [ref=e71]:
              - article [ref=e72] [cursor=pointer]:
                - generic [ref=e75]:
                  - heading [level=3] [ref=e76]:
                    - generic [ref=e77]:
                      - generic [ref=e79]: Pocket Pantry
                      - link [ref=e80]:
                        - /url: /test/submission-pantry
                        - img [ref=e81]
                  - paragraph [ref=e85]: A meal planning tool that helps users turn pantry items into realistic weekly dinners.
            - listitem [ref=e86]:
              - article [ref=e87] [cursor=pointer]:
                - generic [ref=e90]:
                  - heading [level=3] [ref=e91]:
                    - generic [ref=e92]:
                      - generic [ref=e94]: Palette Pilot
                      - link [ref=e95]:
                        - /url: /test/submission-palette
                        - img [ref=e96]
                  - paragraph [ref=e100]: A collaborative moodboard and creative direction workspace for design teams.
            - listitem [ref=e101]:
              - article [ref=e102] [cursor=pointer]:
                - generic [ref=e105]:
                  - heading [level=3] [ref=e106]:
                    - generic [ref=e107]:
                      - generic [ref=e109]: Launch Loom
                      - link [ref=e110]:
                        - /url: /test/submission-home-trusted-launch
                        - img [ref=e111]
                  - paragraph [ref=e115]: A focused launch-planning workspace for small product teams.
            - listitem [ref=e116]:
              - article [ref=e117] [cursor=pointer]:
                - generic [ref=e120]:
                  - heading [level=3] [ref=e121]:
                    - generic [ref=e122]:
                      - generic [ref=e124]: Scoutly Mobile
                      - link [ref=e125]:
                        - /url: /test/submission-home-trusted-scout
                        - img [ref=e126]
                  - paragraph [ref=e130]: A mobile field-research companion for capturing observations on the go.
          - list "Top tests available on Earn" [ref=e131]:
            - listitem [ref=e132]:
              - article [ref=e133] [cursor=pointer]:
                - generic [ref=e136]:
                  - heading "Sprout Habit Open Sprout Habit test" [level=3] [ref=e137]:
                    - generic [ref=e138]:
                      - generic [ref=e140]: Sprout Habit
                      - link "Open Sprout Habit test" [ref=e141]:
                        - /url: /test/submission-sprout
                        - img [ref=e142]
                  - paragraph [ref=e146]: A habit-tracking app focused on gentle accountability and daily routines.
              - generic [ref=e147]: Rank 1 of 6
            - listitem [ref=e148]:
              - article [ref=e149] [cursor=pointer]:
                - generic [ref=e152]:
                  - heading "TrailMixer Open TrailMixer test" [level=3] [ref=e153]:
                    - generic [ref=e154]:
                      - generic [ref=e156]: TrailMixer
                      - link "Open TrailMixer test" [ref=e157]:
                        - /url: /test/submission-trail
                        - img [ref=e158]
                  - paragraph [ref=e162]: A trip-planning companion for stitching outdoor routes, packing lists, and weather together.
              - generic [ref=e163]: Rank 2 of 6
            - listitem [ref=e164]:
              - article [ref=e165] [cursor=pointer]:
                - generic [ref=e168]:
                  - heading "Pocket Pantry Open Pocket Pantry test" [level=3] [ref=e169]:
                    - generic [ref=e170]:
                      - generic [ref=e172]: Pocket Pantry
                      - link "Open Pocket Pantry test" [ref=e173]:
                        - /url: /test/submission-pantry
                        - img [ref=e174]
                  - paragraph [ref=e178]: A meal planning tool that helps users turn pantry items into realistic weekly dinners.
              - generic [ref=e179]: Rank 3 of 6
            - listitem [ref=e180]:
              - article [ref=e181] [cursor=pointer]:
                - generic [ref=e184]:
                  - heading "Palette Pilot Open Palette Pilot test" [level=3] [ref=e185]:
                    - generic [ref=e186]:
                      - generic [ref=e188]: Palette Pilot
                      - link "Open Palette Pilot test" [ref=e189]:
                        - /url: /test/submission-palette
                        - img [ref=e190]
                  - paragraph [ref=e194]: A collaborative moodboard and creative direction workspace for design teams.
              - generic [ref=e195]: Rank 4 of 6
            - listitem [ref=e196]:
              - article [ref=e197] [cursor=pointer]:
                - generic [ref=e200]:
                  - heading "Launch Loom Open Launch Loom test" [level=3] [ref=e201]:
                    - generic [ref=e202]:
                      - generic [ref=e204]: Launch Loom
                      - link "Open Launch Loom test" [ref=e205]:
                        - /url: /test/submission-home-trusted-launch
                        - img [ref=e206]
                  - paragraph [ref=e210]: A focused launch-planning workspace for small product teams.
              - generic [ref=e211]: Rank 5 of 6
            - listitem [ref=e212]:
              - article [ref=e213] [cursor=pointer]:
                - generic [ref=e216]:
                  - heading "Scoutly Mobile Open Scoutly Mobile test" [level=3] [ref=e217]:
                    - generic [ref=e218]:
                      - generic [ref=e220]: Scoutly Mobile
                      - link "Open Scoutly Mobile test" [ref=e221]:
                        - /url: /test/submission-home-trusted-scout
                        - img [ref=e222]
                  - paragraph [ref=e226]: A mobile field-research companion for capturing observations on the go.
              - generic [ref=e227]: Rank 6 of 6
        - heading "Trusted by 4+ global startups" [level=2] [ref=e229]:
          - text: Trusted by 4+ global startups
          - generic [ref=e230]:
            - img [ref=e231]
            - img [ref=e233]
            - img [ref=e235]
            - img [ref=e237]
            - img [ref=e239]
      - generic [ref=e242]:
        - region "How it works" [ref=e243]:
          - generic [ref=e244]:
            - heading "How it works" [level=2] [ref=e245]
            - list [ref=e247]:
              - listitem [ref=e248]:
                - generic [ref=e249]:
                  - heading "Create your test" [level=3] [ref=e250]
                  - paragraph [ref=e251]: Create your first test in seconds. Answer a few questions or use AI
              - listitem [ref=e252]:
                - generic [ref=e253]:
                  - heading "Get testers" [level=3] [ref=e254]
                  - paragraph [ref=e255]: Share your test to unlimited users or earn credits by testing other founder's tests
              - listitem [ref=e256]:
                - generic [ref=e257]:
                  - heading "Gain insights" [level=3] [ref=e258]
                  - paragraph [ref=e259]: Manage every insight from one dashboard. Watch your tests, clip or export it to your favorite LLM
        - region "2 free ways to get feedback" [ref=e260]:
          - generic [ref=e261]:
            - heading "2 free ways to get feedback" [level=2] [ref=e262]: 2 paid free ways to get feedback
            - generic [ref=e263]:
              - article "Earn 1:1 credits" [ref=e264]:
                - img [ref=e266]
                - generic [ref=e267]:
                  - heading "Earn 1:1 credits" [level=3] [ref=e268]
                  - paragraph [ref=e269]: Earn credits 1:1 (we don't take a cut)
              - article "Bring your own testers" [ref=e270]:
                - img [ref=e272]
                - generic [ref=e273]:
                  - heading "Bring your own testers" [level=3] [ref=e274]
                  - paragraph [ref=e275]: There are no limits - bring as many as you want
        - region "If you can link to it, you can test it" [ref=e276]:
          - generic [ref=e277]:
            - generic [ref=e278]:
              - heading "If you can link to it, you can test it" [level=2] [ref=e279]
              - paragraph [ref=e280]: Founders, students, UX designers, product managers, or researchers — Test4Test makes getting valuable insights free and easy
            - generic [ref=e281]:
              - article [ref=e282]:
                - img [ref=e284]
                - generic [ref=e287]:
                  - heading "Websites" [level=3] [ref=e288]
                  - paragraph [ref=e289]: Test live websites, sites in development, password-protected pages, and even competitors’ sites
              - article [ref=e290]:
                - img [ref=e292]
                - generic [ref=e294]:
                  - heading "Prototypes" [level=3] [ref=e295]
                  - paragraph [ref=e296]: Test any prototype with a link — Figma, Adobe XD, Axure, Sketch, Balsamiq, and others
              - article [ref=e297]:
                - generic [ref=e299]:
                  - img [ref=e300]
                  - img [ref=e302]
                - generic [ref=e304]:
                  - heading "Mobile apps" [level=3] [ref=e305]
                  - paragraph [ref=e306]: Test mobile apps on Android or iOS. Whether they're published or still in beta
        - region "Go Wild" [ref=e307]:
          - generic [ref=e308]:
            - generic [ref=e310]:
              - heading "Go Wild" [level=2] [ref=e311]
              - paragraph [ref=e312]: Start recruiting users from social media, forums and communities
            - generic [ref=e313]:
              - article [ref=e314]:
                - img [ref=e316]
                - generic [ref=e317]:
                  - generic [ref=e318]: Other platforms
                  - heading "\"Users\" come from pools" [level=3] [ref=e319]
                  - paragraph [ref=e320]: Most users are professional survey takers, trained to get past screeners
              - article [ref=e321]:
                - img [ref=e323]
                - generic [ref=e324]:
                  - generic [ref=e325]:
                    - generic [ref=e326]: Test4Test
                    - heading "Recruit REAL users" [level=3] [ref=e327]
                    - paragraph [ref=e328]: Recruit users who actually experience the problem you're trying to solve
                  - button "Try Test4Test Premium" [ref=e329] [cursor=pointer]:
                    - text: Try Test4Test Premium
                    - img [ref=e330]
        - region "Ready for feedback?" [ref=e332]:
          - generic [ref=e333]:
            - heading "Ready for feedback?" [level=2] [ref=e334]
            - paragraph [ref=e335]: It takes minutes to submit your app. Start seeing real user feedback today!
            - button "Get started" [ref=e337] [cursor=pointer]:
              - text: Get started
              - img [ref=e338]
  - contentinfo [ref=e340]:
    - generic [ref=e342]:
      - generic [ref=e343]:
        - link "Test4Test home" [ref=e344] [cursor=pointer]:
          - /url: /
          - img [ref=e345]
          - generic [ref=e348]: Test4Test
        - paragraph [ref=e349]: © 2026 Test4Test. All rights reserved.
      - navigation "Product" [ref=e350]:
        - heading "Product" [level=2] [ref=e351]
        - list [ref=e352]:
          - listitem [ref=e353]:
            - link "Get your app tested" [ref=e354] [cursor=pointer]:
              - /url: /submit
          - listitem [ref=e355]:
            - link "Get paid to test" [ref=e356] [cursor=pointer]:
              - /url: /get-paid-to-test
          - listitem [ref=e357]:
            - link "Blog" [ref=e358] [cursor=pointer]:
              - /url: /blog
          - listitem [ref=e359]:
            - link "Sign in" [ref=e360] [cursor=pointer]:
              - /url: /sign-in
      - generic [ref=e361]:
        - heading "Support" [level=2] [ref=e362]
        - link "support@test4test.io" [ref=e363] [cursor=pointer]:
          - /url: mailto:support@test4test.io
```

# Test source

```ts
  1   | import AxeBuilder from "@axe-core/playwright";
  2   | import { expect, test, type Page } from "@playwright/test";
  3   | import routeStates from "./route-states.json" with { type: "json" };
  4   | 
  5   | const renderableRouteStates = routeStates.filter(
  6   |   (route) => !("redirectOnly" in route && route.redirectOnly),
  7   | );
  8   | 
  9   | test.beforeEach(async ({ page }) => {
  10  |   await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
  11  |     throw new Error(`Design-system tests must not contact Supabase: ${route.request().url()}`);
  12  |   });
  13  | });
  14  | 
  15  | async function findHorizontalOverflow(page: Page) {
  16  |   return page.evaluate(() => {
  17  |     const viewportWidth = document.documentElement.clientWidth;
  18  | 
  19  |     return [...document.querySelectorAll<HTMLElement>("body *")]
  20  |       .filter((element) => {
  21  |         const overflowContainer = element.closest<HTMLElement>(
  22  |           '[data-contained-horizontal-overflow="true"]',
  23  |         );
  24  |         return !overflowContainer || overflowContainer === element;
  25  |       })
  26  |       .map((element) => {
  27  |         const rect = element.getBoundingClientRect();
  28  |         const styles = getComputedStyle(element);
  29  |         const parentRect = element.parentElement?.getBoundingClientRect();
  30  |         return {
  31  |           tag: element.tagName.toLowerCase(),
  32  |           classes: element.className?.toString().slice(0, 160) ?? "",
  33  |           text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "",
  34  |           left: Math.round(rect.left),
  35  |           right: Math.round(rect.right),
  36  |           width: Math.round(rect.width),
  37  |           boxSizing: styles.boxSizing,
  38  |           computedWidth: styles.width,
  39  |           minWidth: styles.minWidth,
  40  |           parent:
  41  |             element.parentElement && parentRect
  42  |               ? {
  43  |                   classes: element.parentElement.className?.toString().slice(0, 120) ?? "",
  44  |                   left: Math.round(parentRect.left),
  45  |                   right: Math.round(parentRect.right),
  46  |                   width: Math.round(parentRect.width),
  47  |                 }
  48  |               : null,
  49  |         };
  50  |       })
  51  |       .filter(({ left, right, width }) => width > 0 && (left < -1 || right > viewportWidth + 1))
  52  |       .slice(0, 12);
  53  |   });
  54  | }
  55  | 
  56  | for (const route of renderableRouteStates) {
  57  |   test(`${route.name} has no automatically detectable WCAG A or AA violations`, async ({
  58  |     page,
  59  |   }) => {
  60  |     test.setTimeout(90_000);
  61  |     await page.goto(route.path, { waitUntil: "domcontentloaded" });
  62  |     await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
  63  |     await expect(page.locator("h1:visible")).toHaveCount(1);
  64  |     const results = await new AxeBuilder({ page })
  65  |       .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
  66  |       .analyze();
> 67  |     expect(results.violations).toEqual([]);
      |                                ^ Error: expect(received).toEqual(expected) // deep equality
  68  |   });
  69  | }
  70  | 
  71  | for (const route of renderableRouteStates) {
  72  |   test(`${route.name} reflows at 320 CSS pixels`, async ({ page }) => {
  73  |     await page.setViewportSize({ width: 320, height: 720 });
  74  |     await page.goto(route.path);
  75  |     await expect(page.locator("main")).toBeVisible();
  76  |     const overflow = await findHorizontalOverflow(page);
  77  |     expect(overflow, `Overflowing elements on ${route.path}: ${JSON.stringify(overflow)}`).toEqual(
  78  |       [],
  79  |     );
  80  |   });
  81  | 
  82  |   test(`${route.name} supports 200% text enlargement`, async ({ page }) => {
  83  |     await page.setViewportSize({ width: 780, height: 844 });
  84  |     await page.goto(route.path);
  85  |     await page.locator("html").evaluate((element) => {
  86  |       element.style.fontSize = "200%";
  87  |     });
  88  |     await expect(page.locator("main")).toBeVisible();
  89  |     const overflow = await findHorizontalOverflow(page);
  90  |     expect(overflow, `Overflowing elements on ${route.path}: ${JSON.stringify(overflow)}`).toEqual(
  91  |       [],
  92  |     );
  93  |   });
  94  | 
  95  |   test(`${route.name} supports forced colors and reduced motion`, async ({ page }) => {
  96  |     await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  97  |     await page.goto(route.path);
  98  |     await expect(page.locator("main")).toBeVisible();
  99  |   });
  100 | }
  101 | 
  102 | test("home preserves visible keyboard focus", async ({ page }) => {
  103 |   await page.setViewportSize({ width: 320, height: 720 });
  104 |   await page.goto("/");
  105 |   await expect(
  106 |     page.getByRole("heading", {
  107 |       level: 1,
  108 |       name: "Get free user testing on your web or mobile app",
  109 |     }),
  110 |   ).toBeVisible();
  111 |   await page.keyboard.press("Tab");
  112 |   const skipLink = page.getByRole("link", { name: "Skip to content" });
  113 |   await expect(skipLink).toBeFocused();
  114 |   await expect(skipLink).toBeVisible();
  115 | });
  116 | 
  117 | test("mobile navigation closes with Escape and restores focus", async ({ page }) => {
  118 |   await page.setViewportSize({ width: 390, height: 844 });
  119 |   await page.goto("/");
  120 |   const trigger = page.getByRole("button", { name: /^(Open|Close) navigation$/ });
  121 |   await trigger.click();
  122 |   await expect(trigger).toHaveAttribute("aria-expanded", "true");
  123 |   await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
  124 |   await page.keyboard.press("Escape");
  125 |   await expect(trigger).toHaveAttribute("aria-expanded", "false");
  126 |   await expect(trigger).toBeFocused();
  127 | });
  128 | 
  129 | test("account dialog traps focus, closes with Escape, and restores focus", async ({ page }) => {
  130 |   await page.goto("/profile?ds-user=user-avery");
  131 |   const trigger = page.getByRole("button", { name: "Delete account" });
  132 |   await trigger.click();
  133 | 
  134 |   const dialog = page.getByRole("dialog", { name: "Confirm account deletion" });
  135 |   const cancel = dialog.getByRole("button", { name: "Cancel" });
  136 |   const confirm = dialog.getByRole("button", { name: "Yes, delete my account" });
  137 |   await expect(cancel).toBeFocused();
  138 |   await page.keyboard.press("Shift+Tab");
  139 |   await expect(confirm).toBeFocused();
  140 | 
  141 |   await page.keyboard.press("Escape");
  142 |   await expect(dialog).not.toBeVisible();
  143 |   await expect(trigger).toBeFocused();
  144 | });
  145 | 
```