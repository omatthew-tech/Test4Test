import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function openEarnStep(page: Page, user = "user-mateo") {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Onboarding must use isolated fixtures: ${route.request().url()}`);
  });
  await page.goto(`/earn?ds-user=${user}&ds-founder-welcome=pending`);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "How to earn credits", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function seek(cards: Locator, progress: number) {
  await cards.evaluateAll((elements, fraction) => {
    elements.forEach((element) => {
      element.getAnimations().forEach((animation) => {
        animation.pause();
        const timing = animation.effect!.getTiming();
        animation.currentTime = Number(timing.delay) + Number(timing.duration) * fraction;
      });
    });
  }, progress);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`personalized onboarding rank animation at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const dialog = await openEarnStep(page);
    const preview = dialog.getByRole("img", {
      name: "Example of Palette Pilot moving above two tests on Earn.",
    });
    const cards = preview.locator("article");
    await expect(cards).toHaveCount(3);
    await expect(cards.first().locator("h3")).toHaveText("Palette Pilot");
    await expect(cards.first()).toContainText("A collaborative moodboard");
    await expect(preview.locator("a, button, video, canvas")).toHaveCount(0);
    await expect(dialog.getByRole("heading").locator("span")).toBeFocused();

    await seek(cards, 0);
    const before = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
    expect(before[0]).toBeGreaterThan(before[2]);
    expect(before[2]).toBeGreaterThan(before[1]);
    await page.screenshot({ path: testInfo.outputPath(`rank-start-${viewport.width}.png`) });

    await seek(cards, 0.5);
    const middle = await cards.first().boundingBox();
    expect(middle!.y).toBeLessThan(before[0]);
    expect(middle!.y).toBeGreaterThan(before[1]);
    await page.screenshot({ path: testInfo.outputPath(`rank-moving-${viewport.width}.png`) });

    await cards.evaluateAll((elements) =>
      elements.forEach((element) =>
        element.getAnimations().forEach((animation) => animation.finish()),
      ),
    );
    const after = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
    expect(after[0]).toBeLessThan(after[1]);
    expect(after[1]).toBeLessThan(after[2]);
    expect(after[0]).toBeCloseTo(before[1], 0);
    expect(after[2]).toBeCloseTo(before[0], 0);
    expect(
      await cards
        .first()
        .evaluate((card) => card.getAnimations()[0].effect!.getTiming().iterations),
    ).toBe(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual(
      [],
    );
    await page.screenshot({ path: testInfo.outputPath(`rank-finished-${viewport.width}.png`) });

    // Exercise the intrinsic layout with a long, unbroken user-provided app name.
    await cards
      .first()
      .locator("h3 span")
      .evaluate((element) => {
        element.textContent = "MyVeryLongApplicationNameWithoutAnySpaces".repeat(3);
      });
    const textFitsCards = await cards.evaluateAll((elements) =>
      elements.every((card) =>
        [...card.querySelectorAll("h3 span, p span")].every((text) => {
          const cardBounds = card.getBoundingClientRect();
          const textBounds = text.getBoundingClientRect();
          return textBounds.left > cardBounds.left && textBounds.right < cardBounds.right;
        }),
      ),
    );
    expect(textFitsCards).toBe(true);

    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await seek(cards, 0);
    const replay = await cards.first().boundingBox();
    expect(replay!.y).toBeCloseTo(before[0], 0);
    await expect(dialog.getByRole("heading").locator("span")).toBeFocused();
  });
}

test("reduced motion shows the final order with another user's app", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openEarnStep(page, "user-jo");
  const preview = dialog.getByRole("img", {
    name: "Example of Pocket Pantry moving above two tests on Earn.",
  });
  const cards = preview.locator("article");
  await expect(cards.first().locator("h3")).toHaveText("Pocket Pantry");
  expect(
    await cards.evaluateAll(
      (elements) => elements.flatMap((element) => element.getAnimations()).length,
    ),
  ).toBe(0);
  const top = await cards.first().boundingBox();
  const peer = await cards.nth(1).boundingBox();
  expect(top!.y).toBeLessThan(peer!.y);
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(preview).toHaveCount(0);
});
