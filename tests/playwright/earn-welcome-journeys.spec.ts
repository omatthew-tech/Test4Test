import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Earn welcome checks must use fixtures: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`earn welcome announcement is readable and disappears after a credited test at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/earn?ds-user=user-mateo&ds-earn-welcome=new");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const announcement = page.getByRole("status").filter({ hasText: "Welcome to Test4Test!" });
    await expect(announcement).toHaveText(
      "Welcome to Test4Test! Increase your test's rank by 2 ranks when you complete any test below",
    );
    const dismiss = announcement.getByRole("button", { name: "Dismiss welcome announcement" });
    await expect(dismiss).toBeVisible();
    await expect(dismiss).toHaveCSS("color", "rgb(96, 107, 114)");
    const dismissBox = await dismiss.boundingBox();
    expect(dismissBox!.width).toBeGreaterThanOrEqual(44);
    expect(dismissBox!.height).toBeGreaterThanOrEqual(44);
    await expect(announcement).toHaveCSS("background-color", "rgb(225, 246, 255)");
    await expect(announcement).toHaveCSS("border-radius", "12px");
    const bannerBox = await announcement.boundingBox();
    const summaryBox = await page.locator(".earn-visibility").boundingBox();
    expect(bannerBox!.x).toBeGreaterThanOrEqual(0);
    expect(bannerBox!.x + bannerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(bannerBox!.x).toBe(summaryBox!.x);
    expect(bannerBox!.width).toBe(summaryBox!.width);
    expect(summaryBox!.y - (bannerBox!.y + bannerBox!.height)).toBe(16);
    const results = await new AxeBuilder({ page }).include('[role="status"]').analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`earn-welcome-${viewport.width}.png`) });
    if (viewport.width === 1440) {
      await dismiss.focus();
      await dismiss.press("Enter");
    } else {
      await dismiss.click();
    }
    await expect(announcement).toHaveCount(0);
    await expect(page.locator(".earn-visibility__rank-value")).toContainText("#3");
    await page.goto("/earn?ds-user=user-mateo&ds-earn-welcome=completed");
    await expect(page.getByText("Welcome to Test4Test!")).toHaveCount(0);
    await expect(page.locator(".earn-visibility__rank-value")).toContainText("#1");
  });
}
