import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function finishPreview(page: Page) {
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "You're out of credits" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 14;
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You're out of credits" })).toBeVisible();
  expect(
    await video.evaluate(
      (element: HTMLVideoElement) => element.paused && element.currentTime <= 15,
    ),
  ).toBe(true);
  await expect(page.getByRole("region", { name: "Recording preview ended" })).toBeFocused();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`feedback credit gate at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
      throw new Error(`Fixture contacted Supabase: ${route.request().url()}`);
    });
    await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2&ds-feedback=locked");
    await finishPreview(page);
    await expect(
      page.getByText("Someone tested your app but you haven't tested-back their app"),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Rate video" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Test back", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buy credits", exact: true })).toBeEnabled();
    await expect(page.getByRole("slider", { name: "Playback position" })).toBeDisabled();
    for (const name of ["Earn credits", "Buy credits"]) {
      const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`out-of-credits-${viewport.width}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Earn credits", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/earn/);
    await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2&ds-feedback=last-credit");
    await expect(page.getByRole("group", { name: "Rate video" })).toBeVisible();
    await expect(page.getByText("You're out of credits")).toHaveCount(0);
  });
  test(`test-account credit preview at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/recordings?ds-user=user-avery&preview=out-of-credits&ds-feedback=error");
    await finishPreview(page);
    await expect(page.getByRole("button", { name: "Buy credits", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "You're out of credits" })).toBeVisible();
    await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Buy credits", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Buy credits", exact: true })).toBeVisible();
    const navigationToggle = page.getByRole("button", { name: "Open navigation", exact: true });
    if (await navigationToggle.isVisible()) await navigationToggle.click();
    await page.getByRole("link", { name: "Earn", exact: true }).click();
    await expect(page).toHaveURL(/\/earn$/);
  });
}
