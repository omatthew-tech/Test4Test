import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Homepage video checks must use fixtures: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`home sharing demo loads on visibility and preserves the media frame at ${viewport.width}px`, async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/\/videos\/home-share-test(?:\.av1)?\.mp4/.test(request.url())) {
        requests.push(request.url());
      }
    });
    await page.setViewportSize(viewport);
    await page.goto("/?ds-home-trusted=1");
    const article = page.getByRole("article", { name: "Bring your own testers", exact: true });
    const video = article.locator("video");
    await expect(video).toHaveCount(1);
    await expect(video.locator("source")).toHaveCount(0);
    expect(requests).toEqual([]);
    const before = await video.boundingBox();
    await article.scrollIntoViewIfNeeded();
    await expect(article.getByRole("button", { name: /(?:Pause|Play) sharing demo/ })).toHaveCount(
      0,
    );
    await expect(video).toHaveJSProperty("controls", false);
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    expect(requests.length).toBeGreaterThan(0);
    const after = await video.boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
    expect(after!.width / after!.height).toBeCloseTo(1.5, 2);
    expect(after!.x).toBeGreaterThanOrEqual(0);
    expect(after!.x + after!.width).toBeLessThanOrEqual(viewport.width);
    const heading = await article.getByRole("heading").boundingBox();
    if (viewport.width === 1440) expect(after!.x).toBeGreaterThan(heading!.x + heading!.width);
    else expect(heading!.y).toBeGreaterThanOrEqual(after!.y + after!.height);

    await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
    await expect(video).toHaveJSProperty("paused", true);
    await article.scrollIntoViewIfNeeded();
    await expect(video).toHaveJSProperty("paused", false);

    const results = await new AxeBuilder({ page })
      .include('[data-testid="free-feedback-section"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

for (const preference of ["reduced-motion", "save-data"] as const) {
  test(`home sharing demo stays static for ${preference}`, async ({ page }) => {
    if (preference === "reduced-motion") await page.emulateMedia({ reducedMotion: "reduce" });
    else {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: Object.assign(new EventTarget(), { saveData: true }),
        });
      });
    }
    await page.goto("/?ds-home-trusted=1");
    const article = page.getByRole("article", { name: "Bring your own testers", exact: true });
    await article.scrollIntoViewIfNeeded();
    await expect(article.locator("img")).toHaveJSProperty("complete", true);
    await expect(article.locator("video source")).toHaveCount(0);
    await expect(article.locator("video")).toHaveJSProperty("paused", true);
    await expect(article.locator("video")).not.toBeVisible();
    await expect(article.getByRole("button", { name: /(?:Pause|Play) sharing demo/ })).toHaveCount(
      0,
    );
  });
}

test("home sharing demo falls back to the poster when media cannot load", async ({ page }) => {
  await page.route(/\/videos\/home-share-test(?:\.av1)?\.mp4/, (route) => route.abort());
  await page.goto("/?ds-home-trusted=1");
  const article = page.getByRole("article", { name: "Bring your own testers", exact: true });
  await article.scrollIntoViewIfNeeded();
  await expect(article.locator("video")).toHaveCount(0);
  await expect(article.locator("img")).toBeVisible();
  await expect(article.locator("img")).toHaveJSProperty("complete", true);
  await expect(article.getByRole("button", { name: "Get started" })).toBeEnabled();
});

test("home sharing demo plays the H.264 fallback if the AV1 source fails", async ({ page }) => {
  await page.route("**/videos/home-share-test.av1.mp4", (route) => route.abort());
  await page.goto("/?ds-home-trusted=1");
  const article = page.getByRole("article", { name: "Bring your own testers", exact: true });
  const video = article.locator("video");
  await article.scrollIntoViewIfNeeded();
  await expect(article.locator("video source")).toHaveCount(2);
  await expect(video).toHaveJSProperty("paused", false);
  await expect
    .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentSrc))
    .toMatch(/\/home-share-test\.mp4$/);
  await expect
    .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
});
