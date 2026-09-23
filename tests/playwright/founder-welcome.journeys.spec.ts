import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const titles = [
  "Welcome to Test4Test!",
  "How to earn credits",
  "Share your test",
  "Review your feedback",
];
const platformTitle = "What platforms can you reliably access?";
const url = "/earn?ds-user=user-mateo&ds-founder-welcome=pending";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Onboarding must use isolated fixtures: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`welcome tour, keyboard focus and platform handoff at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(url);
    for (let step = 0; step < titles.length; step++) {
      const dialog = page.getByRole("dialog", { name: titles[step], exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading").locator("span")).toBeFocused();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      if (step === 0) {
        await expect(dialog.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
        await expect(dialog.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
        await expect(dialog.getByRole("list", { name: "Progress" })).toHaveCount(0);
      } else {
        await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: "Back", exact: true }).click();
        const previous = page.getByRole("dialog", { name: titles[step - 1], exact: true });
        await expect(previous.getByRole("heading").locator("span")).toBeFocused();
        await previous.getByRole("button", { name: "Next", exact: true }).click();
        await expect(dialog.getByRole("heading").locator("span")).toBeFocused();
        await expect(dialog.getByRole("listitem")).toHaveCount(3);
        await expect(dialog.locator('[aria-current="step"]')).toHaveText(titles[step]);
        const dots = await dialog.getByRole("list").boundingBox();
        const dialogBounds = await dialog.boundingBox();
        expect(dots!.x + dots!.width / 2).toBeCloseTo(dialogBounds!.x + dialogBounds!.width / 2, 0);
      }
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      if (step === 2) {
        const video = dialog.locator("video");
        await expect(video).toHaveJSProperty("muted", true);
        await expect(video).toHaveJSProperty("loop", true);
        await expect(video).toHaveJSProperty("controls", false);
        await expect(dialog.getByRole("button", { name: /(?:Play|Pause) demo/ })).toHaveCount(0);
        await expect
          .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
          .toBeGreaterThan(0);
        await video.evaluate((el) => {
          const media = el as HTMLVideoElement;
          media.currentTime = media.duration - 0.1;
        });
        await expect
          .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
          .toBeLessThan(1);
        await expect(video).toHaveJSProperty("paused", false);
        const mediaBounds = await video.boundingBox();
        expect(mediaBounds!.width / mediaBounds!.height).toBeCloseTo(1000 / 560, 2);
        expect(mediaBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(mediaBounds!.x + mediaBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      } else {
        await expect(dialog.locator("video")).toHaveCount(0);
      }
      expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual(
        [],
      );
      await page.screenshot({
        path: testInfo.outputPath(`welcome-${step + 1}-${viewport.width}.png`),
      });
      const next = dialog.getByRole("button", {
        name: step === 3 ? "Get started" : "Next",
        exact: true,
      });
      await next.focus();
      await page.keyboard.press("Tab");
      await expect(
        step === 0
          ? dialog.getByRole("link")
          : dialog.getByRole("button", { name: "Close", exact: true }),
      ).toBeFocused();
      if (step > 0) {
        await page.keyboard.press("Tab");
        await expect(dialog.getByRole("button", { name: "Back", exact: true })).toBeFocused();
      }
      await next.focus();
      await page.keyboard.press("Enter");
    }
    const platform = page.getByRole("dialog", { name: platformTitle });
    await expect(platform).toBeVisible();
    await expect(platform.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.reload();
    await expect(page.getByRole("dialog", { name: titles[0] })).toHaveCount(0);
    await expect(platform).toBeVisible();
  });
}

for (const action of ["X", "Escape"]) {
  for (let step = action === "X" ? 1 : 0; step < titles.length; step++) {
    test(`${action} permanently dismisses screen ${step + 1}`, async ({ page }) => {
      await page.goto(url);
      for (let index = 0; index < step; index++)
        await page.getByRole("button", { name: "Next", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: titles[step], exact: true });
      if (action === "X") await dialog.getByRole("button", { name: "Close", exact: true }).click();
      else await dialog.press("Escape");
      await expect(page.getByRole("dialog", { name: platformTitle })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("dialog", { name: platformTitle })).toBeVisible();
      await expect(page.getByRole("dialog", { name: titles[0] })).toHaveCount(0);
    });
  }
}

test("backdrop does not dismiss and unfinished progress restarts", async ({ page }) => {
  await page.goto(url);
  await page.mouse.click(5, 5);
  await expect(page.getByRole("dialog", { name: titles[0] })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("dialog", { name: titles[0] })).toBeVisible();
});

for (const preference of ["reduced-motion", "save-data"] as const) {
  test(`share tutorial remains static with ${preference}`, async ({ page }) => {
    if (preference === "reduced-motion") await page.emulateMedia({ reducedMotion: "reduce" });
    else {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: Object.assign(new EventTarget(), { saveData: true }),
        });
      });
    }
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("onboarding-share-test.mp4")) requests.push(request.url());
    });
    await page.goto(url);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    expect(requests).toEqual([]);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Share your test", exact: true });
    await expect(dialog.locator("video")).toHaveJSProperty("paused", true);
    expect(requests).toEqual([]);
    await expect(dialog.locator("video")).toHaveJSProperty("currentTime", 0);
    await expect(dialog.locator("video")).toHaveAttribute(
      "poster",
      "/videos/onboarding-share-test-poster.webp",
    );
    await expect(dialog.getByRole("button", { name: /(?:Play|Pause) demo/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator("video")).toHaveCount(0);
  });
}

test("share tutorial keeps its poster and instructions if video loading fails", async ({
  page,
}) => {
  await page.route("**/videos/onboarding-share-test.mp4", (route) => route.abort());
  await page.goto(url);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your test", exact: true });
  await expect(dialog.locator("video")).toHaveCount(0);
  await expect(
    dialog.locator('img[src="/videos/onboarding-share-test-poster.webp"]'),
  ).toBeVisible();
  await expect(dialog.getByText("Open Share in the navigation.", { exact: false })).toBeAttached();
  await expect(dialog.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
});
