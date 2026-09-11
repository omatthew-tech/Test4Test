import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Interface tests must not contact Supabase: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test.describe(`${viewport.width}px interface polish`, () => {
    test.use({ viewport });

    test("new pages start at the top and Back restores the previous position", async ({ page }) => {
      await page.goto("/");
      const blogLink = page
        .getByRole("navigation", { name: "Product", exact: true })
        .getByRole("link", { name: "Blog", exact: true });
      await blogLink.scrollIntoViewIfNeeded();
      const previousScroll = await page.evaluate(() => window.scrollY);
      expect(previousScroll).toBeGreaterThan(500);
      await blogLink.click();
      await expect(page).toHaveURL(/\/blog$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page).toHaveTitle("Blog | Test4Test");
      await page.goBack();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("user testing");
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - previousScroll))
        .toBeLessThan(3);
      await page.goForward();
      await expect(page).toHaveTitle("Blog | Test4Test");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("missing pages have a short 404 and a working home link", async ({ page }) => {
      await page.goto("/missing-page");
      await expect(
        page.getByRole("heading", { name: "Page not found", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("404", { exact: true })).toBeVisible();
      await expect(page).toHaveTitle("Page not found | Test4Test");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await page.getByRole("link", { name: "Go to homepage" }).click();
      await expect(page).toHaveURL("/");
      await expect(page).toHaveTitle("Test4Test");
    });

    test("sign in validates email and Enter advances to the focused code field", async ({
      page,
    }) => {
      await page.goto("/sign-in");
      await expect(page).toHaveTitle("Sign in | Test4Test");
      const email = page.getByRole("textbox", { name: "Email address" });
      await email.fill("invalid-email");
      await email.press("Enter");
      await expect(email).toBeFocused();
      expect(
        await email.evaluate((element: HTMLInputElement) => element.validity.typeMismatch),
      ).toBe(true);
      await email.fill("avery@demo.test4test.app");
      await email.press("Enter");
      const code = page.getByRole("textbox", { name: "Test account passcode" });
      await expect(code).toBeFocused();
      await code.fill("123456");
      await code.press("Enter");
      await expect(page.getByRole("status")).toContainText("Missing Supabase configuration");
      await page.getByRole("button", { name: "Change email" }).click();
      await expect(email).toHaveValue("avery@demo.test4test.app");
    });

    test("Enter submits email verification and preserves the entered code on failure", async ({
      page,
    }) => {
      await page.goto("/verify");
      await expect(page).toHaveTitle("Verify your email | Test4Test");
      const code = page.getByRole("textbox", { name: "One-time passcode" });
      await expect(code).toBeFocused();
      await code.fill("123456");
      await code.press("Enter");
      await expect(page.getByRole("status")).toHaveText("Request a new code to continue.");
      await expect(code).toHaveValue("123456");
    });

    for (const closeAction of ["Escape", "Close", "Cancel"]) {
      test(`${closeAction} protects unsaved test edits`, async ({ page }) => {
        await page.addInitScript(() => {
          window.localStorage.setItem(
            "test4test:earn-platform-filter-confirmed:user-mateo",
            "true",
          );
        });
        await page.goto("/earn?edit=submission-palette&ds-user=user-mateo");
        const dialog = page.getByRole("dialog", { name: "Edit app" });
        const appName = dialog.getByRole("textbox", { name: "App name" });
        await appName.fill("Unsaved name");
        if (closeAction === "Escape") await page.keyboard.press("Escape");
        else await dialog.getByRole("button", { name: closeAction, exact: true }).click();
        await expect(
          dialog.getByRole("heading", { name: "Discard changes to Palette Pilot?" }),
        ).toBeFocused();
        await dialog.getByRole("button", { name: "Keep editing" }).click();
        await expect(appName).toBeFocused();
        await expect(appName).toHaveValue("Unsaved name");
        await dialog.getByRole("button", { name: "Close", exact: true }).click();
        await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
        await expect(dialog).not.toBeVisible();
      });
    }
  });
}
