import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Feedback email journeys must not contact Supabase: ${route.request().url()}`);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`legacy feedback email opens its test recording at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(
      "/my-tests/submission-palette?earn_entry=feedback_email&ds-user=user-mateo&ds-recordings=2",
    );
    await expect(page).toHaveURL(/\/recordings\?/);
    const destination = new URL(page.url());
    expect(destination.searchParams.get("submission")).toBe("submission-palette");
    expect(destination.searchParams.get("earn_entry")).toBe("feedback_email");
    await expect(page.getByRole("heading", { name: "Palette Pilot", exact: true })).toBeVisible();
    await expect(page.getByText("Recording 1 of 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous recording" })).toBeDisabled();
    await page.getByRole("button", { name: "Next recording" }).click();
    await expect(page.getByText("Recording 2 of 2", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("submission")).toBe("submission-palette");
    await expect(page.getByRole("button", { name: "Next recording" })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`feedback-email-${viewport.width}.png`) });
  });
}

test("legacy feedback email preserves its test and tracking through sign-in", async ({ page }) => {
  await page.goto("/my-tests/submission-palette?earn_entry=feedback_email");
  await expect(page).toHaveURL(/\/sign-in\?/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo).toBe("/recordings?earn_entry=feedback_email&submission=submission-palette");
  await page.goto(`${returnTo}&ds-user=user-mateo&ds-recordings=2`);
  await expect(page.getByRole("heading", { name: "Palette Pilot", exact: true })).toBeVisible();
});

test("unavailable feedback email test cannot open another test's recording", async ({ page }) => {
  await page.goto("/my-tests/missing?earn_entry=feedback_email&ds-user=user-mateo&ds-recordings=2");
  await expect(page).toHaveURL(/\/recordings\?/);
  await expect(page.getByRole("heading", { name: "Recording unavailable" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
