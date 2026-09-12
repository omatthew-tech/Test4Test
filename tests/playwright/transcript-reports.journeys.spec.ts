import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const path = "/analytics?ds-user=user-mateo&ds-recordings=2";

test("Transcript report exports every revision and retries versions independently", async ({
  page,
}) => {
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=1&ds-transcripts=versions");
  await page.getByRole("button", { name: "Preview report", exact: true }).click();
  const preview = page.getByRole("textbox", { name: "Report preview" });
  const text = await preview.inputValue();
  expect(text).toContain("Recordings: 3");
  expect(text).toContain("Version: Original");
  expect(text).toContain("Version: Revision 1");
  expect(text).toContain("Version: Revision 2");
  expect(text.match(/Test response: response-palette-1/g)).toHaveLength(3);
  expect(text).toContain("version=response-palette-1-revision-2");
  await page.getByRole("button", { name: "Retry transcript 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry transcript 1", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Retry transcript 2", exact: true })).toBeEnabled();
  await expect(preview).toContainText("Transcripts ready: 2 of 3");
});
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Fixture contacted Supabase: ${route.request().url()}`);
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedReport?: string }).copiedReport = text;
        },
      },
    });
  });
});

test("Transcript report preview, clipboard, and UTF-8 download contain identical text", async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.getByRole("combobox", { name: "App" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview report", exact: true }).click();
  const preview = page.getByRole("textbox", { name: "Report preview" });
  await expect(preview).toHaveAttribute("readonly", "");
  const text = await preview.inputValue();
  expect(text).toContain("## App context");
  expect(text).toContain("## Transcripts");
  expect(text).toContain("[00:12.340–00:18.720]");
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByRole("button", { name: "Report copied!", exact: true })).toBeEnabled();
  await expect(page.getByText("Report copied.", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as Window & { copiedReport?: string }).copiedReport),
  ).toBe(text);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("test4test-palette-pilot-2026-09-08.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe(text);
  await expect(page.getByRole("button", { name: "Copy report", exact: true })).toBeVisible();
});

test("Transcript report permits partial exports and retries only failed transcripts", async ({
  page,
}) => {
  await page.goto(`${path}&ds-transcripts=partial`);
  await expect(page.getByText("The report lists any missing transcripts.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download report" })).toBeEnabled();
  await page.getByRole("button", { name: "Preview report", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Report preview" })).toContainText(
    "Transcript failed.",
  );
  await page.getByRole("button", { name: "Retry transcript 2", exact: true }).click();
  await expect(page.getByText("The report lists any missing transcripts.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry transcript 2", exact: true })).toHaveCount(
    0,
  );
});

test("Transcript report waits for preparation but exports completed silent recordings", async ({
  page,
}) => {
  await page.goto(`${path}&ds-transcripts=pending`);
  await expect(page.getByText(/being prepared automatically/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy report" })).toBeDisabled();
  await page.goto(`${path}&ds-transcripts=silent`);
  await expect(page.getByRole("button", { name: "Copy report" })).toBeEnabled();
  await page.getByRole("button", { name: "Preview report", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Report preview" })).toContainText(
    "No speech transcribed.",
  );
});

test("Transcript report offers a focused manual-copy fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("blocked");
        },
      },
    });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  const preview = page.getByRole("textbox", { name: "Report preview" });
  await expect(preview).toBeFocused();
  expect(
    await preview.evaluate((element) => {
      const field = element as HTMLTextAreaElement;
      return field.selectionStart === 0 && field.selectionEnd === field.value.length;
    }),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Download report" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Report copied!", exact: true })).toHaveCount(0);
});

test("Transcript report switches app scope and clears previous preview state", async ({ page }) => {
  await page.goto(`${path}&ds-transcripts=multi`);
  await expect(page.getByRole("combobox", { name: "App" })).toHaveValue("submission-palette");
  await page.getByRole("button", { name: "Preview report", exact: true }).click();
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByRole("button", { name: "Report copied!", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "App" }).selectOption("submission-report-second-app");
  await expect(page.getByRole("button", { name: "Report copied!", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Report preview" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview report", exact: true }).click();
  const preview = page.getByRole("textbox", { name: "Report preview" });
  await expect(preview).toContainText("This is feedback for the beta app.");
  await expect(preview).not.toContainText("response-palette-1");
  await expect(preview).not.toContainText("response-palette-2");
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`Transcript report reflows and is accessible at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(`${path}&ds-transcripts=long`);
    await expect(page.getByRole("button", { name: "Copy report" })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`transcript-report-${viewport.name}.png`),
      fullPage: true,
    });
    const copyButton = page.getByRole("button", { name: "Copy report", exact: true });
    await copyButton.focus();
    const originalButtonBox = await copyButton.boundingBox();
    await page.keyboard.press("Enter");
    const copiedButton = page.getByRole("button", { name: "Report copied!", exact: true });
    await expect(copiedButton).toBeFocused();
    expect(await copiedButton.boundingBox()).toEqual(originalButtonBox);
    await page.screenshot({
      path: testInfo.outputPath(`transcript-report-${viewport.name}-copied.png`),
      fullPage: true,
    });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Download report" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Preview report", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("textbox", { name: "Report preview" })).toBeFocused();
    await page.keyboard.press("Control+End");
    await page.screenshot({
      path: testInfo.outputPath(`transcript-report-${viewport.name}-expanded.png`),
      fullPage: true,
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
