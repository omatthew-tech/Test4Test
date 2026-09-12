import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const titles = ["Create your test", "Get testers", "Gain insights"];
const sectionSelector = '[data-testid="home-how-it-works-section"]';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Homepage card checks must use fixtures: ${route.request().url()}`);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?ds-home-trusted=1");
  await expect(page.getByTestId("home-how-it-works-section")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-12T12:00:01Z"));
});

async function waitForIntersection(page: Page, inView: boolean) {
  // Synchronize native intersection callbacks independently of the paused JavaScript clock.
  await page.locator(`${sectionSelector} ol`).evaluate(
    (element, expected) =>
      new Promise<void>((resolve) => {
        const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting !== expected) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(element);
      }),
    inView,
  );
}

async function showCards(page: Page) {
  const section = page.getByTestId("home-how-it-works-section");
  await section.locator("ol").scrollIntoViewIfNeeded();
  await waitForIntersection(page, true);
  return section;
}

async function expectActive(section: Locator, index: number) {
  await expect(section.locator('[data-active="true"] h3')).toHaveText(titles[index]);
  const cards = section.getByRole("listitem");
  for (let step = 0; step < titles.length; step += 1) {
    await expect(cards.nth(step)).toHaveCSS("opacity", step === index ? "1" : "0");
  }
}

test("mobile how-it-works fades complete cards in order without controls or layout shifts", async ({
  page,
}, testInfo) => {
  const section = await showCards(page);
  const cards = section.getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await expect(section.getByRole("heading", { level: 3 })).toHaveText(titles);
  await expect(section.locator("button, a, [aria-live]")).toHaveCount(0);
  await expectActive(section, 0);
  const initialBounds = await section.boundingBox();

  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("transition-property", "opacity");
    await expect(card).toHaveCSS("transition-duration", "0.36s");
    await expect(card.locator("img")).toHaveJSProperty("complete", true);
    await expect
      .poll(() => card.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const image = await card.locator("img").boundingBox();
    const heading = await card.locator("h3").boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(image!.y + image!.height);
  }

  await page.clock.runFor(4999);
  await expectActive(section, 0);
  await page.clock.runFor(1);
  await expectActive(section, 1);
  await section.screenshot({ path: testInfo.outputPath("mobile-card-2.png") });
  expect(await section.boundingBox()).toEqual(initialBounds);

  for (const index of [2, 0]) {
    await page.clock.runFor(5360);
    await expectActive(section, index);
    expect(await section.boundingBox()).toEqual(initialBounds);
  }

  const snapshot = await section.ariaSnapshot();
  for (const title of titles) expect(snapshot).toContain(title);
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).include(sectionSelector).analyze()).violations).toEqual(
    [],
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("mobile how-it-works suspends offscreen and in hidden tabs with a fresh reading interval", async ({
  page,
}) => {
  const section = page.getByTestId("home-how-it-works-section");
  await page.clock.runFor(10000);
  await expectActive(section, 0);
  await showCards(page);
  await page.clock.runFor(5000);
  await expectActive(section, 1);

  await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
  await expect(section.locator("ol")).not.toBeInViewport();
  await waitForIntersection(page, false);
  await page.clock.runFor(10000);
  await expectActive(section, 1);
  await showCards(page);
  await page.clock.runFor(4999);
  await expectActive(section, 1);
  await page.clock.runFor(1);
  await expectActive(section, 2);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(10000);
  await expectActive(section, 2);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(4999);
  await expectActive(section, 2);
  await page.clock.runFor(1);
  await expectActive(section, 0);
});

test("how-it-works restores static cards for reduced motion and tablet or desktop widths", async ({
  page,
}, testInfo) => {
  const section = await showCards(page);
  const cards = section.getByRole("listitem");
  await page.clock.runFor(5000);
  await expectActive(section, 1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("opacity", "1");
    expect(
      await card.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
    ).toBeLessThan(0.001);
  }
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  await page.clock.runFor(10000);
  await expect(section.locator('[data-active="true"] h3')).toHaveText(titles[1]);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await section.scrollIntoViewIfNeeded();
    for (const card of await cards.all()) await expect(card).toHaveCSS("opacity", "1");
    await page.clock.runFor(10000);
    await expect(section.locator('[data-active="true"] h3')).toHaveText(titles[1]);
    const before = await cards.nth(0).boundingBox();
    const after = await cards.nth(1).boundingBox();
    if (width === 768) expect(after!.y).toBeGreaterThanOrEqual(before!.y + before!.height);
    else {
      expect(after!.y).toBe(before!.y);
      expect(after!.x).toBeGreaterThanOrEqual(before!.x + before!.width);
      await section.screenshot({ path: testInfo.outputPath("desktop-cards.png") });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }

  await page.setViewportSize({ width: 767, height: 844 });
  await showCards(page);
  await expectActive(section, 1);
  await page.clock.runFor(5000);
  await expectActive(section, 2);
});
