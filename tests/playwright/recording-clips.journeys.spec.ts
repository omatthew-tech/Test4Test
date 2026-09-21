import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`create and share a clip at ${viewport.width}px`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2&ds-recording-media=demo");
    await expect(page.getByRole("slider", { name: "Playback position" })).toHaveAttribute(
      "max",
      "7",
    );
    const media = page.locator("video");
    await expect(media).not.toHaveAttribute("controls");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect
      .poll(() => media.evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
    await page.getByRole("slider", { name: "Playback position" }).press("Home");
    await page.screenshot({
      path: testInfo.outputPath(`player-controls-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Clip", exact: true }).click();
    const start = page.getByRole("slider", { name: "Clip start" });
    await start.focus();
    await page.keyboard.press("ArrowRight");
    await expect(start).toHaveAttribute("aria-valuenow", "0.1");
    const end = page.getByRole("slider", { name: "Clip end" });
    const startBounds = await start.boundingBox();
    const bounds = await end.boundingBox();
    expect(startBounds!.y).toBe(bounds!.y);
    const player = page.getByRole("group", { name: /^Recording 1 of 2: .+ player$/ });
    await expect(player.getByRole("slider", { name: "Clip start" })).toBeVisible();
    await expect(player.getByRole("slider", { name: "Playback position" })).toHaveCount(1);
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 - 30, bounds!.y + bounds!.height / 2);
    await page.mouse.up();
    await expect(end).not.toHaveAttribute("aria-valuenow", "7");
    await start.press("End");
    const narrowStart = await start.boundingBox();
    const narrowEnd = await end.boundingBox();
    expect(narrowStart!.x + narrowStart!.width).toBeLessThanOrEqual(narrowEnd!.x);
    expect(narrowStart!.height).toBeGreaterThanOrEqual(44);
    await start.press("Home");
    await start.press("ArrowRight");
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    await expect(start).toBeVisible();
    await page.getByRole("button", { name: "Exit fullscreen" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`clip-editor-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save clip" }).click();
    const dialog = page.getByRole("dialog", { name: "Share clip" });
    await expect(dialog).toBeVisible();
    const url = await dialog.getByRole("textbox", { name: "Clip link" }).inputValue();
    expect(url).toMatch(/\/clips\/shared#[0-9a-f]{64}$/);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await dialog.getByRole("button", { name: "Copy link" }).click();
    await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect(dialog.getByText("Your video is being created.", { exact: false })).toBeHidden({
      timeout: 10000,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`clip-share-${viewport.width}.png`),
      fullPage: true,
    });
    const guest = await browser.newContext({ viewport });
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(url);
      await expect(guestPage.getByLabel("MastoMetrics clip", { exact: true })).toBeVisible();
      expect((await new AxeBuilder({ page: guestPage }).analyze()).violations).toEqual([]);
      await guestPage.screenshot({
        path: testInfo.outputPath(`clip-guest-${viewport.width}.png`),
        fullPage: true,
      });
    } finally {
      await guest.close();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Next recording" }).click();
    await expect(page.getByRole("button", { name: "Clip", exact: true })).toBeVisible();
  });
}
