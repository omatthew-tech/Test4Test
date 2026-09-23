import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function openNavigation(page: Page) {
  await page.getByRole("button", { name: "Open navigation" }).click();
  const trigger = page.getByRole("button", { name: "Close navigation" });
  const id = await trigger.getAttribute("aria-controls");
  return page.locator(`[id="${id}"]`);
}

test("visitor menu is compact, accessible, and keeps both auth actions on one row", async ({
  page,
}) => {
  await page.goto("/");
  const panel = await openNavigation(page);
  await expect(panel.getByRole("link")).toHaveText([
    "Blog",
    "Get paid to test",
    "Sign in",
    "Get started",
  ]);
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(16);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(374);
  expect(bounds!.height).toBeLessThan(320);
  const signIn = await panel.getByRole("link", { name: "Sign in", exact: true }).boundingBox();
  const start = await panel.getByRole("link", { name: "Get started", exact: true }).boundingBox();
  expect(signIn!.y).toBe(start!.y);
  expect(Math.abs(signIn!.width - start!.width)).toBeLessThan(1);
  for (const link of await panel.getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).include("header").analyze()).violations).toEqual([]);
  await panel.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/sign-in");
  await expect(panel).toHaveCount(0);
});

test("founder menu groups current navigation and all existing account destinations", async ({
  page,
}, testInfo) => {
  await page.goto("/earn?ds-user=user-mateo");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const panel = await openNavigation(page);
  await expect(panel.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText([
    "Earn",
    "Share",
    "Analyze",
  ]);
  await expect(panel.getByRole("link", { name: "Earn", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(panel.getByRole("navigation", { name: "Account" }).getByRole("link")).toHaveText([
    "Profile",
    "Messages (1)",
    "My reviews",
    "New app",
    "Buy credits",
  ]);
  await expect(panel.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect((await new AxeBuilder({ page }).include("header").analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("profile-menu-mobile.png") });
  for (const [name, route] of [
    ["Profile", "/profile"],
    ["New app", "/submit"],
    ["Buy credits", "/buy-credits"],
    ["My reviews", "/submissions"],
    ["Messages (1)", "/messages"],
  ]) {
    await page.goto("/profile?ds-user=user-mateo");
    const accountPanel = await openNavigation(page);
    await accountPanel.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(`${route}?ds-user=user-mateo`);
    await expect(accountPanel).toHaveCount(0);
  }
});

test("tester menu preserves account restrictions", async ({ page }) => {
  await page.goto("/profile?ds-tester=locked");
  const panel = await openNavigation(page);
  await expect(panel.getByRole("link")).toHaveText(["Earn", "Profile", "Messages (1)"]);
  await expect(panel.getByRole("button", { name: "Sign out" })).toBeVisible();
  await panel.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your tester profile" })).toBeVisible();
});

test("disclosure supports keyboard entry, Escape, Tab exit, toggle, and outside dismissal", async ({
  page,
}) => {
  await page.goto("/profile");
  const trigger = page.getByRole("button", { name: /^(Open|Close) navigation$/ });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await expect(primary.getByRole("link", { name: "Blog", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(primary.getByRole("link", { name: "Blog", exact: true })).toBeFocused();
  await page.getByRole("banner").getByRole("link", { name: "Get started", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("main").click({ position: { x: 2, y: 500 } });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("short screens scroll within the panel and resizing restores desktop navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto("/profile?ds-user=user-mateo");
  const panel = await openNavigation(page);
  const bounds = await panel.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400);
  const signOut = panel.getByRole("button", { name: "Sign out" });
  await signOut.focus();
  await expect(signOut).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Profile menu" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
