import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const route = "/recordings?ds-user=user-mateo&ds-recordings=2&ds-recording-transcript=";

async function mediaFixture(page: Page) {
  // Local silent PCM exercises the browser's real media clock without external recordings.
  const samples = 8000 * 240;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  await page.route("**/__transcript-clock.wav", (request) => {
    const range = request
      .request()
      .headers()
      .range?.match(/bytes=(\d+)-(\d*)/);
    const start = Number(range?.[1] ?? 0);
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return request.fulfill({
      status: range ? 206 : 200,
      contentType: "audio/wav",
      body: wav.subarray(start, end + 1),
      headers: {
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` } : {}),
      },
    });
  });
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.src = "/__transcript-clock.wav";
    video.muted = true;
    video.load();
  });
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
}

async function seek(page: Page, time: number) {
  await page.locator("video").evaluate((video: HTMLVideoElement, seconds) => {
    video.currentTime = seconds;
  }, time);
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.seeking))
    .toBe(false);
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(time, 1);
}

for (const width of [390, 1440]) {
  test(`transcript follows the real media clock in four-line blocks at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${route}ready`);
    const transcript = page.locator("[data-transcript-page]");
    await expect(transcript.locator("span")).not.toHaveCount(0);
    expect(
      await transcript.evaluate((element) => {
        const tops = new Set(
          Array.from(element.children).flatMap((word) =>
            Array.from(word.getClientRects()).map((rect) => Math.round(rect.top)),
          ),
        );
        return tops.size;
      }),
    ).toBe(4);
    await expect(transcript.locator('[data-spoken="true"]')).toHaveCount(0);
    await mediaFixture(page);
    const video = await page.locator("video").elementHandle();
    await page.locator("video").evaluate((element: HTMLVideoElement) => {
      element.playbackRate = 2;
      return element.play();
    });
    await expect.poll(() => transcript.locator('[data-spoken="true"]').count()).toBeGreaterThan(0);
    await page.locator("video").evaluate((element: HTMLVideoElement) => element.pause());
    const firstBlockWords = await transcript.locator("span").count();
    const endOfBlock = 0.9 + (firstBlockWords - 1) * 0.5;
    await seek(page, endOfBlock - 0.02);
    await expect(transcript).toHaveAttribute("data-transcript-page", "0");
    await seek(page, endOfBlock + 0.02);
    await expect(transcript).toHaveAttribute("data-transcript-page", String(firstBlockWords));
    await seek(page, 0);
    await expect(transcript).toHaveAttribute("data-transcript-page", "0");
    await expect(transcript.locator('[data-spoken="true"]')).toHaveCount(0);
    expect(await video?.evaluate((element) => element === document.querySelector("video"))).toBe(
      true,
    );
    await seek(page, 5);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page
      .locator('section[aria-labelledby="recording-transcript-heading"]')
      .screenshot({ path: `.tmp/transcript-${width}.png` });
  });
}

test("reflow, enlarged text, and reduced motion preserve the selected passage", async ({
  page,
}) => {
  await page.goto(`${route}ready`);
  await mediaFixture(page);
  await seek(page, 40);
  await page.setViewportSize({ width: 390, height: 844 });
  const transcript = page.locator("[data-transcript-page]");
  await expect
    .poll(async () => Number(await transcript.getAttribute("data-transcript-page")))
    .toBeGreaterThan(0);
  await page.addStyleTag({
    content: '[data-transcript-page], p[class*="measure"] { font-size: 32px; line-height: 48px; }',
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(transcript.locator('[data-spoken="true"]')).not.toHaveCount(0);
  expect(await transcript.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    false,
  );
  expect(
    await transcript
      .locator("span")
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
  ).toBeLessThan(0.01);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(transcript.locator('[data-spoken="true"]')).not.toHaveCount(0);
});

for (const scenario of ["processing", "failed", "error", "empty", "untimed"]) {
  test(`transcript ${scenario} state keeps the recording available`, async ({ page }) => {
    await page.goto(`${route}${scenario}`);
    await expect(page.locator("video")).toBeVisible();
    if (scenario === "failed") {
      const video = await page.locator("video").elementHandle();
      await page.getByRole("button", { name: "Retry transcription" }).click();
      await expect(page.locator("[data-transcript-page] span")).not.toHaveCount(0);
      expect(await video?.evaluate((element) => element === document.querySelector("video"))).toBe(
        true,
      );
    } else if (scenario === "error")
      await expect(page.getByRole("button", { name: "Reload transcript" })).toBeVisible();
    else if (scenario === "empty")
      await expect(page.getByText("No speech was detected in this recording.")).toBeVisible();
    else if (scenario === "untimed")
      await expect(page.getByRole("region", { name: "Transcript text" })).toBeVisible();
    else await expect(page.getByText(/Transcript is being prepared/)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
