import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Description checks must use fixtures: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const mode of ["long", "unbroken"]) {
    test(`Earn ${mode} descriptions expand independently at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/earn?ds-user=user-mateo&ds-earn-welcome=new&ds-earn-variant=B&ds-earn-descriptions=${mode}`,
      );
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

      const ownerToggle = page.getByRole("button", {
        name: "Show full description for Palette Pilot",
      });
      const otherToggle = page.getByRole("button", {
        name: "Show full description for Pocket Pantry",
      });
      await expect(ownerToggle).toHaveAttribute("aria-expanded", "false");
      await expect(otherToggle).toHaveAttribute("aria-expanded", "false");
      const preview = page.locator(`[id="${await ownerToggle.getAttribute("aria-describedby")}"]`);
      const more = ownerToggle.getByText("more", { exact: true });
      await expect(more).toBeVisible();
      const lineHeight = await preview.evaluate((element) =>
        parseFloat(getComputedStyle(element).lineHeight),
      );
      expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 2 + 1);
      await expect(preview).toHaveCSS("-webkit-line-clamp", "2");
      const previewBounds = (await preview.boundingBox())!;
      const moreBounds = (await more.boundingBox())!;
      await expect(preview).toHaveText(/…\s+more$/);
      expect(moreBounds.x + moreBounds.width).toBeLessThanOrEqual(
        previewBounds.x + previewBounds.width + 1,
      );
      expect(moreBounds.y).toBeGreaterThanOrEqual(previewBounds.y + lineHeight - 1);
      expect(moreBounds.y + moreBounds.height).toBeLessThanOrEqual(
        previewBounds.y + previewBounds.height + 1,
      );
      await page.screenshot({ path: testInfo.outputPath("collapsed.png"), fullPage: true });

      await ownerToggle.press("Enter");
      const showLess = page.getByRole("button", { name: "Show less Palette Pilot" });
      await expect(showLess).toHaveAttribute("aria-expanded", "true");
      await expect(showLess).toBeFocused();
      const fullDescription = page.locator(
        `p[id="${await showLess.getAttribute("aria-controls")}"]`,
      );
      await expect(fullDescription).toBeVisible();
      expect((await fullDescription.boundingBox())!.height).toBeGreaterThan(lineHeight * 2);
      await expect(otherToggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("link", { name: "View analytics", exact: true })).toHaveAttribute(
        "href",
        "/analytics",
      );
      expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("expanded.png"), fullPage: true });

      await showLess.press("Space");
      await expect(ownerToggle).toHaveAttribute("aria-expanded", "false");
      await expect(ownerToggle).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);

      await otherToggle.getByText("more", { exact: true }).click();
      await expect(page.getByRole("button", { name: "Show less Pocket Pantry" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(ownerToggle).toHaveAttribute("aria-expanded", "false");
      await page
        .getByRole("article")
        .filter({ has: page.getByRole("heading", { name: "Pocket Pantry", exact: true }) })
        .getByRole("link", { name: /View test|Resume test/ })
        .click();
      await expect(page).toHaveURL(/\/test\/submission-pantry/);
    });
  }
}

test("Earn detects overflow again when a description reflows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    "/earn?ds-user=user-mateo&ds-earn-welcome=new&ds-earn-variant=B&ds-earn-descriptions=responsive",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const toggle = page.getByRole("button", { name: "Show full description for Palette Pilot" });
  await expect(toggle).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(toggle).toHaveCount(0);
});
