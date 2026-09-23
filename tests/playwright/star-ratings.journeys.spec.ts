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
    await expect(cards.getByRole("link", { name: /^Message about / })).toHaveCount(6);
    const unratedCard = cards.filter({
      has: page.getByRole("heading", { name: "Unrated recording", exact: true }),
    });
    const message = unratedCard.getByRole("link", { name: "Message about Unrated recording" });
    const bookmark = unratedCard.getByRole("button", { name: /favorites/ });
    await expect(message).toHaveAttribute(
      "href",
      "/messages?response=response-palette-1&ds-user=user-avery",
    );
    for (const action of [message, bookmark]) {
      const bounds = await action.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      const icon = await action.locator("svg").boundingBox();
      expect(icon!.width).toBe(16);
      expect(icon!.height).toBe(16);
    }
    const messageBounds = (await message.boundingBox())!;
    const bookmarkBounds = (await bookmark.boundingBox())!;
    expect(messageBounds.x + messageBounds.width).toBeLessThanOrEqual(bookmarkBounds.x);
    expect(messageBounds.y).toBe(bookmarkBounds.y);
    await message.focus();
    await expect(message).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(bookmark).toBeFocused();
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
    await expect(page.getByText("Not rated", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("heading", { name: "Unrated recording", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`submitted-stars-${viewport.width}.png`),
      fullPage: true,
    });
    await message.click();
    await expect(page).toHaveURL(/\/messages\?response=response-palette-1&ds-user=user-avery$/);
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(composer).toBeVisible();
    await expect(page.getByText("Start a conversation about Palette Pilot.")).toBeVisible();
    await composer.fill("Thanks for sharing your app. I have a question about my feedback.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("region", { name: "Message history" })).toContainText(
      "I have a question about my feedback.",
    );
    await expect(page).toHaveURL(/\/messages\/[^?]+\?ds-user=user-avery$/);
    await page.goto("/submissions?ds-user=user-avery&ds-star-ratings=1");
    await message.click();
    await expect(page.getByRole("region", { name: "Message history" })).toContainText(
      "I have a question about my feedback.",
    );
    await expect(page.getByText("Start a conversation about Palette Pilot.")).toHaveCount(0);
  });
}
