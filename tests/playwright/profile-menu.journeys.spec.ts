import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openProfileMenu(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Profile menu" }).click();
  return page.getByRole("menu", { name: "Profile menu" });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const mobile = viewport.width === 390;
  test.describe(`profile dropdown at ${viewport.width}`, () => {
    test.use({ viewport });

    test("groups destinations and navigates, including the current route", async ({ page }) => {
      await page.goto("/profile?ds-user=user-mateo");
      const menu = await openProfileMenu(page, mobile);
      const navigation = page
        .getByRole("navigation", { name: "Primary" })
        .filter({ visible: true });
      await expect(navigation.getByRole("link")).toHaveText(["Earn", "Share", "Analytics"]);
      await expect(menu.getByRole("menuitem")).toHaveText([
        "Profile",
        "New app",
        "My reviews",
        "Sign out",
      ]);
      await expect(menu.getByRole("separator")).toHaveCount(2);
      await expect(
        page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }),
      ).toHaveCount(0);
      await expect(menu.getByRole("menuitem", { name: "Profile", exact: true })).toBeFocused();
      expect(
        (await new AxeBuilder({ page }).include('[role="menu"]').analyze()).violations,
      ).toEqual([]);

      const box = await menu.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      for (const item of await menu.getByRole("menuitem").all()) {
        expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }

      for (const [label, route] of [
        ["Profile", "/profile"],
        ["New app", "/submit"],
        ["My reviews", "/submissions"],
      ]) {
        // The submission wizard intentionally hides all navigation, so start each destination
        // check from the shared shell instead of expecting a menu inside that flow.
        await page.goto("/profile?ds-user=user-mateo");
        await openProfileMenu(page, mobile);
        await menu.getByRole("menuitem", { name: label, exact: true }).click();
        await expect(page).toHaveURL(`${route}?ds-user=user-mateo`);
        await expect(menu).toHaveCount(0);
        if (mobile)
          await expect(page.getByRole("dialog", { name: "Navigation" })).not.toBeVisible();
      }

      await openProfileMenu(page, mobile);
      await menu.getByRole("menuitem", { name: "My reviews", exact: true }).click();
      await expect(page).toHaveURL("/submissions?ds-user=user-mateo");
      await expect(menu).toHaveCount(0);
      if (mobile) await expect(page.getByRole("dialog", { name: "Navigation" })).not.toBeVisible();
    });

    test("supports keyboard movement, dismissal, and nested Escape", async ({ page }) => {
      await page.goto("/profile?ds-user=user-mateo");
      if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
      const trigger = page.getByRole("button", { name: "Profile menu" });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("menuitem", { name: "New app" })).toBeFocused();
      await page.keyboard.press("End");
      await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
      await page.keyboard.press("Home");
      await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      if (mobile) await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
      await page.keyboard.press("Space");
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await trigger.click();
      const outside = mobile
        ? page.getByRole("heading", { name: "Navigation", exact: true })
        : page.getByRole("main");
      await outside.click({ position: { x: 4, y: 4 } });
      await expect(page.getByRole("menu")).toHaveCount(0);
      if (mobile) {
        await trigger.focus();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Navigation" })).not.toBeVisible();
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
      }
    });

    test("preserves tester restrictions and guest navigation", async ({ page }) => {
      await page.goto("/profile?ds-tester=locked");
      const menu = await openProfileMenu(page, mobile);
      await expect(menu.getByRole("menuitem")).toHaveText(["Profile", "Sign out"]);
      await expect(menu.getByRole("separator")).toHaveCount(1);
      await expect(
        page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }),
      ).toHaveCount(0);
      await menu.getByRole("menuitem", { name: "Profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your tester profile" })).toBeVisible();

      await page.goto("/profile");
      if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByRole("button", { name: "Profile menu" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Get started", exact: true })).toBeVisible();
    });

    test("only highlights hovered items after opening with the mouse", async ({ page }) => {
      await page.goto("/profile?ds-user=user-mateo");
      const menu = await openProfileMenu(page, mobile);
      for (const item of await menu.getByRole("menuitem").all()) {
        await expect(item).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
      const profile = menu.getByRole("menuitem", { name: "Profile", exact: true });
      const reviews = menu.getByRole("menuitem", { name: "My reviews" });
      await reviews.hover();
      await expect(reviews).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(profile).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await profile.hover();
      await expect(profile).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(reviews).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await page.getByRole("button", { name: "Profile menu", exact: true }).hover();
      await expect(profile).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });
  });
}
