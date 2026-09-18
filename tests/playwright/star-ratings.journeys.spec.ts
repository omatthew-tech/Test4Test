import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`submitted ratings preserve stars beside every status at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
      throw new Error(`Fixture contacted Supabase: ${route.request().url()}`);
    });
    await page.goto("/submissions?ds-user=user-avery&ds-star-ratings=1");
    const cards = page.locator(".submission-feedback-card");
    await expect(cards).toHaveCount(6);
    for (const stars of [1, 2, 3, 4, 5]) {
      const card = cards.filter({
        has: page.getByRole("heading", { name: `${stars}-star recording`, exact: true }),
      });
      const display = card.getByRole("img", { name: `${stars} out of 5 stars` });
      await expect(display).toBeVisible();
      expect(
        await display
          .locator("svg")
          .evaluateAll(
            (icons) => icons.filter((icon) => getComputedStyle(icon).fill !== "none").length,
          ),
      ).toBe(stars);
      await expect(card.getByRole("button", { name: /favorites/ })).toHaveCount(
        stars === 5 ? 1 : 0,
      );
    }
    await expect(cards.nth(0).getByRole("heading")).toHaveText("1-star recording");
    await expect(cards.nth(1).getByRole("heading")).toHaveText("2-star recording");
    await expect(cards.nth(2).getByText("Report in progress")).toBeVisible();
    await expect(cards.nth(3).getByText("Test closed")).toBeVisible();
    await expect(cards.nth(3).getByRole("link", { name: "Report Rating" })).toBeVisible();
    await expect(page.getByText("Not rated", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`submitted-stars-${viewport.width}.png`),
      fullPage: true,
    });
  });
}
