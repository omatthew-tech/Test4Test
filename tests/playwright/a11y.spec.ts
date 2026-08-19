import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import routeStates from "./route-states.json" with { type: "json" };

const renderableRouteStates = routeStates.filter(
  (route) => !("redirectOnly" in route && route.redirectOnly),
);

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Design-system tests must not contact Supabase: ${route.request().url()}`);
  });
});

async function findHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;

    return [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        const parentRect = element.parentElement?.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          classes: element.className?.toString().slice(0, 160) ?? "",
          text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          boxSizing: styles.boxSizing,
          computedWidth: styles.width,
          minWidth: styles.minWidth,
          parent:
            element.parentElement && parentRect
              ? {
                  classes: element.parentElement.className?.toString().slice(0, 120) ?? "",
                  left: Math.round(parentRect.left),
                  right: Math.round(parentRect.right),
                  width: Math.round(parentRect.width),
                }
              : null,
        };
      })
      .filter(({ left, right, width }) => width > 0 && (left < -1 || right > viewportWidth + 1))
      .slice(0, 12);
  });
}

for (const route of renderableRouteStates) {
  test(`${route.name} has no automatically detectable WCAG A or AA violations`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("h1:visible")).toHaveCount(1);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

for (const route of renderableRouteStates) {
  test(`${route.name} reflows at 320 CSS pixels`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(route.path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await findHorizontalOverflow(page);
    expect(overflow, `Overflowing elements on ${route.path}: ${JSON.stringify(overflow)}`).toEqual(
      [],
    );
  });

  test(`${route.name} supports 200% text enlargement`, async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 844 });
    await page.goto(route.path);
    await page.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });
    await expect(page.locator("main")).toBeVisible();
    const overflow = await findHorizontalOverflow(page);
    expect(overflow, `Overflowing elements on ${route.path}: ${JSON.stringify(overflow)}`).toEqual(
      [],
    );
  });

  test(`${route.name} supports forced colors and reduced motion`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto(route.path);
    await expect(page.locator("main")).toBeVisible();
  });
}

test("home preserves visible keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Get free user testing on your web or mobile app",
    }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
});

test("mobile navigation closes with Escape and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation" })).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("account dialog traps focus, closes with Escape, and restores focus", async ({ page }) => {
  await page.goto("/profile?ds-user=user-avery");
  const trigger = page.getByRole("button", { name: "Delete account" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Confirm account deletion" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Yes, delete my account" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
