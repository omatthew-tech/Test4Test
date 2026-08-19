import { expect, test, type Page } from "@playwright/test";
import routeStates from "./route-states.json" with { type: "json" };

const renderableRouteStates = routeStates.filter(
  (route) => !("redirectOnly" in route && route.redirectOnly),
);

const representativeStories = [
  "components-actions--variants",
  "components-inputs--states",
  "components-navigation--navigation-patterns",
  "components-feedback--states",
  "components-data-display--data-states",
  "patterns-product--workflow-states",
  "patterns-product--analytics-data-presentation",
  "patterns-product--recording-flow",
];

const contractStories = [
  "components-actions--button-contract",
  "components-actions--icon-button-contract",
  "components-actions--link-contract",
  "components-inputs--text-field-contract",
  "components-inputs--textarea-contract",
  "components-inputs--select-contract",
  "components-inputs--combobox-contract",
  "components-inputs--checkbox-contract",
  "components-inputs--radio-contract",
  "components-inputs--switch-contract",
  "components-inputs--help-text-contract",
  "components-layout--container-contract",
  "components-layout--stack-contract",
  "components-layout--cluster-contract",
  "components-layout--grid-contract",
  "components-layout--divider-contract",
  "components-layout--section-contract",
  "components-layout--bento-grid-contract",
  "components-layout--application-shell-contract",
  "components-navigation--top-navigation-contract",
  "components-navigation--mobile-navigation-drawer-contract",
  "components-navigation--tabs-contract",
  "components-navigation--breadcrumb-contract",
  "components-navigation--pagination-contract",
  "components-navigation--menu-contract",
  "components-feedback--alert-contract",
  "components-feedback--toast-contract",
  "components-feedback--inline-validation-contract",
  "components-feedback--form-summary-contract",
  "components-feedback--progress-contract",
  "components-feedback--skeleton-contract",
  "components-feedback--empty-state-contract",
  "components-overlays--dialog-contract",
  "components-overlays--drawer-contract",
  "components-overlays--popover-contract",
  "components-overlays--tooltip-contract",
  "components-data-display--card-contract",
  "components-data-display--surface-contract",
  "components-data-display--table-contract",
  "components-data-display--list-contract",
  "components-data-display--badge-contract",
  "components-data-display--status-indicator-contract",
  "components-data-display--technical-value-contract",
  "patterns-product--page-header-contract",
  "patterns-product--stepper-contract",
  "patterns-product--rating-control-contract",
  "patterns-product--recording-status-contract",
  "patterns-product--test-row-contract",
  "patterns-product--question-editor-contract",
  "patterns-product--response-viewer-contract",
];

const explicitStateStories = [
  "components-navigation--top-navigation-public-state",
  "components-navigation--mobile-navigation-drawer-open-state",
  "components-feedback--toast-info-state",
  "components-feedback--toast-warning-state",
  "components-feedback--toast-danger-state",
  "components-overlays--dialog-open-state",
  "components-overlays--drawer-open-state",
  "components-overlays--popover-open-state",
  "components-overlays--tooltip-open-state",
];

const stories = [...representativeStories, ...contractStories, ...explicitStateStories];

const viewportScreenshotStories = new Set([
  "components-feedback--toast-contract",
  "components-feedback--toast-info-state",
  "components-feedback--toast-warning-state",
  "components-feedback--toast-danger-state",
  "components-navigation--mobile-navigation-drawer-open-state",
  "components-overlays--dialog-open-state",
  "components-overlays--drawer-open-state",
]);

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Visual tests must not contact Supabase: ${route.request().url()}`);
  });
});

async function settleRouteImages(page: Page) {
  const images = page.locator("main img");
  const count = await images.count();
  for (let index = 0; index < count; index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
  }
  if (count > 0) {
    await expect
      .poll(
        () =>
          images.evaluateAll((elements) =>
            elements.every(
              (element) =>
                element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
            ),
          ),
        { message: "All route images should finish decoding before visual capture" },
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  const homeHeroPanel = page.getByTestId("home-hero-panel");
  if ((await homeHeroPanel.count()) > 0) {
    const backgroundImageUrl = await homeHeroPanel.evaluate((element) => {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      return backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] ?? null;
    });

    if (backgroundImageUrl) {
      await page.evaluate(async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
      }, backgroundImageUrl);
    }
  }
}

for (const story of stories) {
  for (const viewport of viewports) {
    test(`${story} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/iframe.html?id=${story}&viewMode=story`);
      await page.waitForLoadState("networkidle");
      const screenshotName = `${story}-${viewport.name}.png`;
      const options = { animations: "disabled" as const };

      if (viewportScreenshotStories.has(story)) {
        await expect(page).toHaveScreenshot(screenshotName, options);
      } else {
        await expect(page.locator("#storybook-root")).toHaveScreenshot(screenshotName, options);
      }
    });
  }
}

for (const route of renderableRouteStates) {
  for (const viewport of viewports) {
    test(`${route.name} route at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`http://127.0.0.1:4173${route.path}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("main")).toBeVisible();
      await settleRouteImages(page);
      await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
        animations: "disabled",
        fullPage: true,
      });
    });
  }
}
