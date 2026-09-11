import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});

for (const width of [390, 1440])
  for (const path of ["/blog", "/blog/top-5-free-user-testing-platforms-2026"]) {
    test(`production hydration retains existing article DOM at ${width}: ${path}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (/hydration|Minified React error/.test(message.text())) errors.push(message.text());
      });
      let release!: () => void;
      const scripts = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/*.js", async (route) => {
        await scripts;
        await route.continue();
      });
      await page.goto(path, { waitUntil: "commit" });
      await expect(page.locator("h1")).toBeVisible();
      const original = await page.locator("h1").elementHandle();
      release();
      await page.waitForFunction(() =>
        Object.keys(document.querySelector("h1") ?? {}).some((key) =>
          key.startsWith("__reactFiber$"),
        ),
      );
      expect(await original!.evaluate((node) => node === document.querySelector("h1"))).toBe(true);
      expect(errors).toEqual([]);
      const fontUrls = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.includes("GeistVF.woff2")),
      );
      expect(fontUrls).toHaveLength(1);
      expect(fontUrls[0]).toContain("/assets/static/");
    });
  }
