import { expect, test, type Page } from "@playwright/test";

async function returnWithCredit(page: Page) {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Rank animation checks must use fixtures: ${route.request().url()}`);
  });
  await page.goto("/earn?ds-user=user-mateo&ds-earn-welcome=completed");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.addInitScript(() => {
    window.history.replaceState(
      {
        ...window.history.state,
        usr: {
          kind: "earned-credit",
          placementSnapshot: {
            ownerSubmissionId: "submission-palette",
            previousWouldRank: 3,
            previousWouldRankedSubmissionCount: 3,
            capturedAt: "2026-09-21T12:00:00Z",
          },
        },
      },
      "",
    );
  });
  await page.reload();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`rank-up motion preserves the Earn list at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await returnWithCredit(page);
    const owner = page.locator(".earn-row--private-placement");
    const moving = page.locator('[style*="--earn-rank-up-offset"]');
    await expect(moving.first()).toBeVisible();
    const titles = await page.locator(".earn-list h3").allTextContents();
    expect(titles[0]).toBe("Palette Pilot");
    await moving.evaluateAll((cards) => {
      cards.forEach((card) =>
        card.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = Number(animation.effect!.getTiming().delay);
        }),
      );
    });
    const start = await owner.evaluate((card) => ({
      y: new DOMMatrixReadOnly(getComputedStyle(card).transform).m42,
      top: card.getBoundingClientRect().top,
    }));
    expect(start.y).toBeGreaterThan(0);
    await expect(page.locator(".earn-row-anchor--private-placement")).not.toBeFocused();
    const peer = page.locator(".earn-list > .earn-row-anchor").nth(1).locator(":scope > *");
    expect(await peer.evaluate((card) => card.getBoundingClientRect().top)).toBeLessThan(start.top);
    await page.screenshot({
      path: testInfo.outputPath(`rank-start-${viewport.width}.png`),
      fullPage: false,
    });
    await moving.evaluateAll((cards) => {
      cards.forEach((card) =>
        card.getAnimations().forEach((animation) => {
          const timing = animation.effect!.getTiming();
          animation.currentTime = Number(timing.delay) + Number(timing.duration) / 2;
        }),
      );
    });
    const middleY = await owner.evaluate(
      (card) => new DOMMatrixReadOnly(getComputedStyle(card).transform).m42,
    );
    expect(middleY).toBeGreaterThan(0);
    expect(middleY).toBeLessThan(start.y);
    await page.screenshot({
      path: testInfo.outputPath(`rank-moving-${viewport.width}.png`),
      fullPage: false,
    });
    await moving.evaluateAll((cards) =>
      cards.forEach((card) => card.getAnimations().forEach((animation) => animation.finish())),
    );
    await expect(moving).toHaveCount(0);
    await expect(owner).toHaveCSS("transform", "none");
    await expect(page.locator(".earn-list h3")).toHaveText(titles);
    await expect(page.locator(".earn-row-anchor--private-placement")).toBeFocused();
    await expect(page.locator(".earn-visibility__rank-value")).toContainText("#1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`rank-finished-${viewport.width}.png`),
      fullPage: false,
    });
  });
}

test("reduced motion keeps the credit confirmation without moving cards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await returnWithCredit(page);
  await expect(
    page.getByText("Congrats, you earned 1 credit. Your test moved up on Earn."),
  ).toBeVisible();
  await expect(page.locator(".earn-row-anchor--private-placement")).toBeFocused();
  await expect(page.locator('[style*="--earn-rank-up-offset"]')).toHaveCount(0);
  await expect(page.locator(".earn-row--private-placement")).toHaveCSS("animation-name", "none");
});
