import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`buy credits selection and navigation at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/buy-credits?ds-user=user-avery");
    await expect(page).toHaveTitle("Buy credits | Test4Test");
    await expect(page.getByRole("heading", { name: "Buy credits", exact: true })).toBeVisible();

    const packs = [
      { name: "1 credit", price: "$4.99" },
      { name: "3 credits", price: "$13.99" },
      { name: "5 credits", price: "$19.99" },
    ];
    for (const pack of packs) {
      const region = page.getByRole("region", { name: pack.name, exact: true });
      await expect(region.getByText(pack.price, { exact: true })).toBeVisible();
      const buy = region.getByRole("button", { name: `Buy ${pack.name}`, exact: true });
      await buy.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Credit purchases aren't available yet" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(`You selected ${pack.name} for ${pack.price}.`);
      await expect(dialog).toContainText("You haven't been charged.");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(buy).toBeFocused();
    }
    await expect(page.getByRole("region", { name: "5 credits", exact: true })).toContainText(
      "Best value",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`buy-credits-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Buy 1 credit", exact: true }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Earn credits", exact: true }).click();
    await expect(page).toHaveURL(/\/earn\?ds-user=user-avery/);
  });
}
