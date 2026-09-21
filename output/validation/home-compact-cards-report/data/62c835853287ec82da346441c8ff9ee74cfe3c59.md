# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> home Trusted by section shows six Earn cards in an accessible horizontal loop
- Location: tests\playwright\journeys.spec.ts:146:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('home-trusted-by-section').getByRole('heading', { name: /^Trusted by \d[\d,]*\+ global startups$/, level: 2 })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('home-trusted-by-section').getByRole('heading', { name: /^Trusted by \d[\d,]*\+ global startups$/, level: 2 })

```

```yaml
- status: Loading page
```

# Test source

```ts
  61  |     const section = page.getByTestId("free-feedback-section");
  62  |     const methods = section.getByRole("article");
  63  |     await expect(methods).toHaveCount(2);
  64  |     await expect(section.getByRole("heading", { level: 2 })).toHaveText([
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
> 161 |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  162 |   await expect(list.getByRole("article")).toHaveCount(6);
  163 |   const logos = list.getByTestId("home-trusted-logo");
  164 |   await expect(logos).toHaveCount(6);
  165 |   for (const logo of await logos.all()) {
  166 |     await expect(logo).toHaveAttribute("aria-hidden", "true");
  167 |     await expect(logo).toHaveCSS("width", "24px");
  168 |     await expect(logo).toHaveCSS("height", "24px");
  169 |     await expect(logo.locator("img")).toHaveAttribute("alt", "");
  170 |     await expect(logo.locator("img")).toHaveCSS("visibility", "visible");
  171 |     expect(
  172 |       await logo.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth),
  173 |     ).toBeGreaterThan(0);
  174 |   }
  175 |   await expect(list.getByText(/^(Web|iOS|Android)$/)).toHaveCount(0);
  176 |   await expect(list.getByRole("link", { name: "View test" })).toHaveCount(0);
  177 |   const openLinks = list.getByRole("link", { name: /^Open .+ test$/ });
  178 |   await expect(openLinks).toHaveCount(6);
  179 |   await expect(openLinks.first()).toHaveAttribute("href", /^\/test\//);
  180 |   for (const description of await section.locator("article p").all()) {
  181 |     await expect(description).toBeEmpty();
  182 |     await expect(description).toHaveCSS("display", "none");
  183 |   }
  184 |   const duplicateList = section.locator('ol[aria-hidden="true"]');
  185 |   await expect(duplicateList).not.toHaveAttribute("inert");
  186 |   for (const link of await duplicateList.locator("a").all()) {
  187 |     await expect(link).toHaveAttribute("tabindex", "-1");
  188 |   }
  189 |   await expect(section.getByTestId("home-trusted-by-pause")).toHaveCount(0);
  190 | 
  191 |   const cardPositions = await list.locator("li").evaluateAll((items) =>
  192 |     items.slice(0, 2).map((item) => {
  193 |       const bounds = item.getBoundingClientRect();
  194 |       return { left: bounds.left, top: bounds.top };
  195 |     }),
  196 |   );
  197 |   expect(cardPositions[1]?.left).toBeGreaterThan(cardPositions[0]?.left ?? 0);
  198 |   expect(Math.abs((cardPositions[1]?.top ?? 0) - (cardPositions[0]?.top ?? 0))).toBeLessThan(1);
  199 | 
  200 |   await page.getByTestId("home-trusted-by-viewport").hover();
  201 |   await expect(track).toHaveCSS("animation-play-state", "paused");
  202 | 
  203 |   const keyframes = await track.evaluate((element) =>
  204 |     element
  205 |       .getAnimations()
  206 |       .flatMap((animation) =>
  207 |         animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [],
  208 |       )
  209 |       .map((keyframe) => keyframe.transform),
  210 |   );
  211 |   expect(keyframes[0]).toContain("-");
  212 |   expect(keyframes[keyframes.length - 1]).toMatch(/0px|matrix\(1, 0, 0, 1, 0, 0\)/);
  213 | 
  214 |   for (const viewport of [
  215 |     { width: 390, height: 844 },
  216 |     { width: 1440, height: 900 },
  217 |   ]) {
  218 |     await page.setViewportSize(viewport);
  219 |     const cardHeights = await list
  220 |       .getByRole("article")
  221 |       .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  222 |     expect(Math.max(...cardHeights) - Math.min(...cardHeights)).toBeLessThanOrEqual(1);
  223 |     await expect
  224 |       .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  225 |       .toBe(true);
  226 |     await testInfo.attach(`trusted-by-${viewport.width}.png`, {
  227 |       body: await section.screenshot({ animations: "disabled" }),
  228 |       contentType: "image/png",
  229 |     });
  230 |   }
  231 | });
  232 | 
  233 | for (const viewport of [
  234 |   { width: 390, height: 844 },
  235 |   { width: 1440, height: 900 },
  236 | ]) {
  237 |   for (const duplicate of [false, true]) {
  238 |     test(`home Trusted by ${duplicate ? "duplicate" : "primary"} cards open a new tab from their body and padding at ${viewport.width}px`, async ({
  239 |       page,
  240 |     }) => {
  241 |       await page.setViewportSize(viewport);
  242 | 
  243 |       for (const target of ["body", "padding"]) {
  244 |         await page.goto("/?ds-home-trusted=1");
  245 |         const section = page.getByTestId("home-trusted-by-section");
  246 |         const track = page.getByTestId("home-trusted-by-track");
  247 |         await section.scrollIntoViewIfNeeded();
  248 |         // Inspect both halves of the loop without waiting for a complete animation cycle.
  249 |         await track.evaluate((element, showDuplicate) => {
  250 |           for (const animation of element.getAnimations()) {
  251 |             animation.pause();
  252 |             const duration = Number(animation.effect?.getTiming().duration);
  253 |             animation.currentTime = showDuplicate ? duration - 1 : 0;
  254 |           }
  255 |         }, duplicate);
  256 | 
  257 |         const list = duplicate
  258 |           ? section.locator('ol[aria-hidden="true"]')
  259 |           : section.getByRole("list", { name: "Top tests available on Earn" });
  260 |         const card = list.locator("article").first();
  261 |         const link = card.locator("a");
```