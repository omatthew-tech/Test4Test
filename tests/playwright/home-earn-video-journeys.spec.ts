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
  test(`home credit demo loads on visibility without changing the frame at ${viewport.width}px`, async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/videos/home-earn-credit.mp4")) requests.push(request.url());
    });
    await page.setViewportSize(viewport);
    await page.goto("/?ds-home-trusted=1");
    const article = page.getByRole("article", {
      name: "Earn credits by testing apps",
      exact: true,
    });
    const video = article.locator("video");
    await expect(video).toHaveCount(1);
    expect(requests).toEqual([]);
    const before = await video.boundingBox();
    await article.scrollIntoViewIfNeeded();
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    expect(requests.length).toBeGreaterThan(0);
    await expect(video).toHaveJSProperty("videoWidth", 1620);
    await expect(video).toHaveJSProperty("videoHeight", 1080);
    await expect(video).toHaveJSProperty("controls", false);
    await expect(article.getByRole("button")).toHaveCount(0);
    const after = await video.boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
    expect(after!.width / after!.height).toBeCloseTo(1.5, 2);
    expect(after!.x).toBeGreaterThanOrEqual(0);
    expect(after!.x + after!.width).toBeLessThanOrEqual(viewport.width);
    const heading = await article.getByRole("heading").boundingBox();
    if (viewport.width === 1440) {
      expect(after!.x + after!.width).toBeLessThanOrEqual(heading!.x);
    } else {
      expect(heading!.y).toBeGreaterThanOrEqual(after!.y + after!.height);
    }
    await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
    await expect(video).toHaveJSProperty("paused", true);
    await article.scrollIntoViewIfNeeded();
    await expect(video).toHaveJSProperty("paused", false);
  });
}

for (const preference of ["reduced-motion", "save-data"] as const) {
  test(`home credit demo shows the earned-credit still for ${preference}`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/videos/home-earn-credit.mp4")) requests.push(request.url());
    });
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
    const article = page.getByRole("article", {
      name: "Earn credits by testing apps",
      exact: true,
    });
    await article.scrollIntoViewIfNeeded();
    await expect(article.locator("img")).toHaveAttribute(
      "src",
      "/videos/home-earn-credit-static.webp",
    );
    await expect(article.locator("img")).toHaveJSProperty("complete", true);
    await expect(article.locator("video")).not.toBeVisible();
    await expect(article.locator("video")).toHaveJSProperty("paused", true);
    expect(requests).toEqual([]);
  });
}

test("home credit demo falls back to its confirmation when the video cannot load", async ({
  page,
}) => {
  await page.route("**/videos/home-earn-credit.mp4", (route) => route.abort());
  await page.goto("/?ds-home-trusted=1");
  const article = page.getByRole("article", {
    name: "Earn credits by testing apps",
    exact: true,
  });
  await article.scrollIntoViewIfNeeded();
  await expect(article.locator("video")).toHaveCount(0);
  await expect(article.locator("img")).toHaveAttribute(
    "src",
    "/videos/home-earn-credit-static.webp",
  );
  await expect(article.locator("img")).toHaveJSProperty("complete", true);
  await expect(article.getByRole("button")).toHaveCount(0);
});
