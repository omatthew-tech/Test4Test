import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`recording feedback actions at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
      throw new Error(`Fixture contacted Supabase: ${route.request().url()}`);
    });
    await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2");
    const rating = page.getByRole("group", { name: "Rate video" });
    const submit = page.getByRole("button", { name: "Submit", exact: true });
    const filledStars = () =>
      rating
        .locator("label svg")
        .evaluateAll(
          (stars) => stars.filter((star) => getComputedStyle(star).fill !== "none").length,
        );
    await expect(rating.getByRole("radio")).toHaveCount(5);
    await expect(rating.getByRole("radio", { name: "1 star", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Clear rating" })).toHaveCount(0);
    await expect(submit).toHaveCount(0);
    await rating.locator("label").nth(4).hover();
    await expect.poll(filledStars).toBe(5);
    await expect(rating.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(submit).toHaveCount(0);
    await rating.locator("label").nth(1).hover();
    await expect.poll(filledStars).toBe(2);
    await page.getByRole("heading", { level: 1 }).hover();
    await expect.poll(filledStars).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(`recording-feedback-${viewport.width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const tip = page.getByRole("button", { name: "Tip", exact: true });
    const message = page.getByRole("button", { name: "Message", exact: true });
    for (const action of [tip, message]) {
      const bounds = await action.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await rating.getByRole("radio", { name: "3 stars" }).check();
    await expect(submit).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "stars saved." })).toHaveCount(0);
    await rating.locator("label").nth(4).hover();
    await expect.poll(filledStars).toBe(5);
    await expect(rating.getByRole("radio", { name: "3 stars" })).toBeChecked();
    await page.getByRole("heading", { level: 1 }).hover();
    await expect.poll(filledStars).toBe(3);
    await expect(rating.getByRole("radio", { name: "3 stars" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(rating.getByRole("radio", { name: "4 stars" })).toBeChecked();
    const lastStarBounds = await rating.locator("label").last().boundingBox();
    const submitBounds = await submit.boundingBox();
    expect(submitBounds!.x).toBeGreaterThanOrEqual(lastStarBounds!.x + lastStarBounds!.width);
    expect(Math.abs(submitBounds!.y - lastStarBounds!.y)).toBeLessThanOrEqual(1);
    expect(submitBounds!.width).toBeGreaterThanOrEqual(44);
    expect(submitBounds!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: testInfo.outputPath(`recording-feedback-draft-${viewport.width}.png`),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 320, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.setViewportSize(viewport);
    }
    // Leaving without submitting must not persist a draft to either recording.
    await page.getByRole("button", { name: "Next recording" }).click();
    await expect(rating.getByRole("radio", { checked: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Previous recording" }).click();
    await expect(rating.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(submit).toHaveCount(0);
    await rating.getByRole("radio", { name: "4 stars" }).check();
    await submit.click();
    await expect(page.getByRole("status").filter({ hasText: "4 stars saved." })).toBeVisible();
    await expect(submit).toHaveCount(0);
    await expect(rating.getByRole("radio", { name: "4 stars" })).toBeFocused();
    await page.getByRole("button", { name: "Next recording" }).click();
    await expect(rating.getByRole("radio", { name: "4 stars" })).not.toBeChecked();
    await page.getByRole("button", { name: "Previous recording" }).click();
    await expect(rating.getByRole("radio", { name: "4 stars" })).toBeChecked();
    await expect(submit).toHaveCount(0);
    await rating.getByRole("radio", { name: "2 stars" }).check();
    await submit.click();
    await expect(page.getByRole("status").filter({ hasText: "2 stars saved." })).toBeVisible();
    await tip.click();
    await expect(page.getByRole("dialog", { name: "Tip the tester" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toBeFocused();
    await message.click();
    await expect(page.getByRole("dialog", { name: "Message the tester" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Write email" })).toHaveAttribute(
      "href",
      /^mailto:/,
    );
    await page.keyboard.press("Escape");
    await expect(message).toBeFocused();
  });
}
