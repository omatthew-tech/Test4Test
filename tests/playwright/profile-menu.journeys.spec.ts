import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openProfileMenu(page: Page) {
  await page.getByRole("button", { name: "Profile menu" }).click();
  return page.getByRole("menu", { name: "Profile menu" });
}

test.describe("desktop profile dropdown", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("groups destinations and navigates, including the current route", async ({ page }) => {
    await page.goto("/profile?ds-user=user-mateo");
    const menu = await openProfileMenu(page);
    const navigation = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
    await expect(navigation.getByRole("link")).toHaveText(["Earn", "Share", "Analyze"]);
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Profile",
      "New app",
      "My reviews",
      "Messages (1)",
      "Sign out",
    ]);
    await expect(menu.getByRole("separator")).toHaveCount(2);
    await expect(
      page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Profile", exact: true })).toBeFocused();
    expect((await new AxeBuilder({ page }).include('[role="menu"]').analyze()).violations).toEqual(
      [],
    );

    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
    for (const item of await menu.getByRole("menuitem").all()) {
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    for (const [label, route] of [
      ["Profile", "/profile"],
      ["New app", "/submit"],
      ["My reviews", "/submissions"],
      ["Messages (1)", "/messages"],
    ]) {
      // The submission wizard intentionally hides all navigation, so start each destination
      // check from the shared shell instead of expecting a menu inside that flow.
      await page.goto("/profile?ds-user=user-mateo");
      await openProfileMenu(page);
      await menu.getByRole("menuitem", { name: label, exact: true }).click();
      await expect(page).toHaveURL(`${route}?ds-user=user-mateo`);
      await expect(menu).toHaveCount(0);
    }

    await openProfileMenu(page);
    await menu.getByRole("menuitem", { name: "My reviews", exact: true }).click();
    await expect(page).toHaveURL("/submissions?ds-user=user-mateo");
    await expect(menu).toHaveCount(0);
  });

  test("supports keyboard movement and dismissal", async ({ page }) => {
    await page.goto("/profile?ds-user=user-mateo");
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
    await page.keyboard.press("Space");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await trigger.click();
    await page.getByRole("main").click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("preserves tester restrictions and guest navigation", async ({ page }) => {
    await page.goto("/profile?ds-tester=locked");
    const menu = await openProfileMenu(page);
    await expect(menu.getByRole("menuitem")).toHaveText(["Profile", "Messages (1)", "Sign out"]);
    await expect(menu.getByRole("separator")).toHaveCount(1);
    await expect(
      page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Profile", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your tester profile" })).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByRole("button", { name: "Profile menu" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get started", exact: true })).toBeVisible();
  });

  test("only highlights hovered items after opening with the mouse", async ({ page }) => {
    await page.goto("/profile?ds-user=user-mateo");
    const menu = await openProfileMenu(page);
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
