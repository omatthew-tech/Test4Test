import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Experiment checks must use fixtures: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const variant of ["A", "B"]) {
    test(`Earn experiment ${variant} at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(`/earn?ds-user=user-mateo&ds-earn-welcome=new&ds-earn-variant=${variant}`);
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      const summary = page.locator(".earn-visibility");
      await expect(summary).toBeVisible();
      if (variant === "A") {
        await expect(page.getByText("Welcome to Test4Test!")).toBeVisible();
        await expect(summary).toContainText("#3");
        await expect(page.getByRole("button", { name: "Complete a test" })).toHaveCount(0);
      } else {
        await expect(page.getByText("Welcome to Test4Test!")).toHaveCount(0);
        await expect(summary).toContainText("Your app isn't listed yet...");
        await expect(page.getByText("Only visible to you")).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`earn-${variant}-${viewport.width}.png`),
        fullPage: true,
      });
      if (variant === "B") {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.getByRole("button", { name: "Complete a test" }).click();
        await expect(page.locator(":focus")).toContainText("View test");
      }
      await page.goto(
        `/earn?ds-user=user-mateo&ds-earn-welcome=completed&ds-earn-variant=${variant}`,
      );
      await expect(summary).toContainText("#1");
      await expect(page.getByRole("button", { name: "Complete a test" })).toHaveCount(0);
      await expect(page.getByText("Welcome to Test4Test!")).toHaveCount(0);
    });
  }
  test(`Admin experiment aggregates at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin?ds-user=user-avery&ds-reports=1&ds-experiment=1");
    const panel = page.getByRole("region", { name: "Earn first-test experiment" });
    await expect(
      panel.getByRole("table", { name: "First credited test completion by version" }),
    ).toBeVisible();
    await expect(panel).toContainText("+10.00 percentage points");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include('[aria-labelledby="earn-experiment-title"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`earn-admin-${viewport.width}.png`),
      fullPage: true,
    });
    await panel.getByRole("button", { name: "End experiment", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "End the Earn experiment?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep running" }).click();
    await expect(panel.getByRole("button", { name: "End experiment", exact: true })).toBeFocused();
  });
}
