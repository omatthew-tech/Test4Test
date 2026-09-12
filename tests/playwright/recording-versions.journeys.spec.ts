import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const anonymous of [false, true]) {
  test(`mobile saved-file upload requires no answers (anonymous=${anonymous})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/test/palette-pilot?shared=1&ds-public-link=1&ds-recording-upload=controlled${anonymous ? "" : "&ds-user=user-avery"}`,
    );
    await page.getByText("Already recorded?", { exact: true }).click();
    await page.getByLabel("Upload saved recording").setInputFiles({
      name: "phone-recording.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("phone recording fixture"),
    });
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
      .toBe(true);
    await page.evaluate(() => window.__testRecordingUploadControl?.succeed());
    await expect(page.getByRole("button", { name: "Submit test", exact: true })).toBeEnabled();
    await expect(page.locator(".test-session__questions")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Submit test", exact: true })).toBeEnabled();
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`recording history selects and restores each version at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2&ds-recording-history=1");
    const selector = page.getByRole("combobox", { name: "Recording version" });
    await expect(selector).toHaveValue("response-palette-2-revision-1");
    await selector.selectOption("response-palette-2-original");
    await expect(page).toHaveURL(/version=response-palette-2-original/);
    await page.reload();
    await expect(selector).toHaveValue("response-palette-2-original");
    await expect(page.locator("video")).toBeVisible();
    await page.getByRole("button", { name: "Next recording" }).click();
    await expect(selector).toHaveValue("response-palette-1-revision-1");
    await expect(page).not.toHaveURL(/version=/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("an unavailable recording version stops loading and cannot play another version", async ({
  page,
}) => {
  await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2&version=missing");
  await expect(page.getByRole("alert")).toContainText("This recording version is unavailable.");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByText("Loading recording", { exact: true })).toHaveCount(0);
});

test("helpful feedback cannot open the recording revision flow", async ({ page }) => {
  await page.goto("/submissions/response-palette-1/revise?ds-user=user-avery");
  await expect(page.getByText(/not currently eligible for revision/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Get started" })).toHaveCount(0);
});
