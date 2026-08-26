import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __testMicrophoneIsLoud: boolean;
    __testMediaRecorderStartCount: number;
    __testMediaRecorderPauseCount: number;
    __testMediaRecorderResumeCount: number;
    __testMediaRecorderStopCount: number;
    __testRecordingPipDocument: Document | null;
    __testEndScreenShare: () => void;
  }
}

async function installMicrophoneFixture(page: Page) {
  await page.addInitScript(() => {
    window.__testMicrophoneIsLoud = false;
    window.__testMediaRecorderStartCount = 0;
    window.__testMediaRecorderPauseCount = 0;
    window.__testMediaRecorderResumeCount = 0;
    window.__testMediaRecorderStopCount = 0;
    window.__testRecordingPipDocument = null;

    class TestMicrophoneAnalyser {
      fftSize = 512;
      smoothingTimeConstant = 0;

      getByteTimeDomainData(data: Uint8Array) {
        data.forEach((_, index) => {
          data[index] = window.__testMicrophoneIsLoud ? (index % 2 === 0 ? 123 : 133) : 128;
        });
      }
    }

    class TestMicrophoneAudioContext {
      createAnalyser() {
        return new TestMicrophoneAnalyser();
      }

      createMediaStreamSource() {
        return { connect: () => undefined };
      }

      close() {
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: TestMicrophoneAudioContext,
    });

    const microphoneTrack = {
      kind: "audio",
      getSettings: () => ({ deviceId: "test-microphone" }),
      readyState: "live",
      stop: () => undefined,
    };
    const displayTrack = {
      kind: "video",
      onended: null as (() => void) | null,
      readyState: "live",
      stop: () => undefined,
    };
    window.__testEndScreenShare = () => displayTrack.onended?.();

    class TestMediaStream {
      constructor(private readonly tracks: Array<typeof microphoneTrack | typeof displayTrack>) {}

      getAudioTracks() {
        return this.tracks.filter((track) => track.kind === "audio");
      }

      getVideoTracks() {
        return this.tracks.filter((track) => track.kind === "video");
      }

      getTracks() {
        return this.tracks;
      }
    }

    class TestMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      mimeType = "video/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      state: "inactive" | "paused" | "recording" = "inactive";

      start() {
        this.state = "recording";
        window.__testMediaRecorderStartCount += 1;
      }

      pause() {
        this.state = "paused";
        window.__testMediaRecorderPauseCount += 1;
      }

      resume() {
        this.state = "recording";
        window.__testMediaRecorderResumeCount += 1;
      }

      stop() {
        this.state = "inactive";
        window.__testMediaRecorderStopCount += 1;
        this.ondataavailable?.({ data: new Blob(["test recording"], { type: this.mimeType }) });
        this.onstop?.();
      }
    }

    const microphoneStream = new TestMediaStream([microphoneTrack]);
    const displayStream = new TestMediaStream([displayTrack]);

    Object.defineProperty(window, "MediaStream", {
      configurable: true,
      value: TestMediaStream,
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: TestMediaRecorder,
    });

    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: {
        requestWindow: async () => {
          const pipFrame = document.createElement("iframe");
          pipFrame.title = "Test recording controls";
          pipFrame.style.position = "fixed";
          pipFrame.style.left = "-10000px";
          pipFrame.style.width = "360px";
          pipFrame.style.height = "300px";
          document.body.append(pipFrame);
          const pipDocument = pipFrame.contentDocument;

          if (!pipDocument) {
            throw new Error("The recording control document could not be created.");
          }

          window.__testRecordingPipDocument = pipDocument;
          return {
            addEventListener: () => undefined,
            close: () => undefined,
            closed: false,
            document: pipDocument,
            focus: () => undefined,
          };
        },
      },
    });

    Object.defineProperty(window, "open", {
      configurable: true,
      value: () => ({ closed: false, focus: () => undefined, opener: null }),
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          {
            deviceId: "test-microphone",
            groupId: "test-group",
            kind: "audioinput",
            label: "Test microphone",
            toJSON: () => ({}),
          },
        ],
        getDisplayMedia: async () => displayStream,
        getUserMedia: async () => microphoneStream,
      },
    });
  });
}

test("floating recorder starts, pauses, resumes, and finalizes capture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMicrophoneFixture(page);
  await page.goto("/test/submission-palette?ds-user=user-avery&ds-recording=1");

  const getStarted = page.getByRole("button", { name: "Get started" });
  await expect(getStarted).toBeDisabled();

  await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.evaluate(() => {
    window.__testMicrophoneIsLoud = true;
  });
  await expect(page.getByRole("img", { name: "Microphone test passed" })).toBeVisible();
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(getStarted).toBeEnabled();

  await getStarted.click();
  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(0);
  await expect(page.getByRole("heading", { name: "Your test is recording" })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        finishButton:
          window.__testRecordingPipDocument?.getElementById("recording-pip-finish")?.textContent ??
          null,
        startButton: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-start")
          ?.textContent?.trim(),
        title: window.__testRecordingPipDocument?.title,
      })),
    )
    .toEqual({ finishButton: null, startButton: "Start test", title: "Ready to record" });

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-start")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(1);
  await expect(page.getByRole("heading", { name: "Your test is recording" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        finishButton: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-finish")
          ?.textContent?.trim(),
        pauseButtonLabel: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-pause")
          ?.getAttribute("aria-label"),
        controlSizes: (() => {
          const pauseButton =
            window.__testRecordingPipDocument?.getElementById("recording-pip-pause");
          const timer = window.__testRecordingPipDocument?.querySelector(".recording-pip__timer");
          const pauseBounds = pauseButton?.getBoundingClientRect();
          const timerBounds = timer?.getBoundingClientRect();

          return {
            pauseHeight: pauseBounds?.height,
            pauseWidth: pauseBounds?.width,
            timerHeight: timerBounds?.height,
          };
        })(),
        startButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-start"),
        ),
        title: window.__testRecordingPipDocument?.title,
      })),
    )
    .toEqual({
      controlSizes: {
        pauseHeight: 28,
        pauseWidth: 28,
        timerHeight: 28,
      },
      finishButton: "Finish recording",
      pauseButtonLabel: "Pause recording",
      startButton: false,
      title: "Recording live",
    });

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-pause")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(1);
  await expect(page.getByRole("heading", { name: "Recording paused" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "I'm finished testing" })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        finishButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-finish"),
        ),
        pauseButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-pause"),
        ),
        pausedMain: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__main")
          ?.classList.contains("recording-pip__main--paused"),
        pausedTitle: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__paused-title")
          ?.textContent?.trim(),
        resumeButton: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-resume")
          ?.textContent?.trim(),
        title: window.__testRecordingPipDocument?.title,
      })),
    )
    .toEqual({
      finishButton: false,
      pauseButton: false,
      pausedMain: true,
      pausedTitle: "Recording paused",
      resumeButton: "Resume recording",
      title: "Recording paused",
    });

  const pausedTimer = await page.evaluate(
    () => window.__testRecordingPipDocument?.querySelector(".recording-pip__timer")?.textContent,
  );
  await page.waitForTimeout(1100);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__testRecordingPipDocument?.querySelector(".recording-pip__timer")?.textContent,
      ),
    )
    .toBe(pausedTimer);

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-resume")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(1);
  await expect(page.getByRole("heading", { name: "Your test is recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "I'm finished testing" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__testRecordingPipDocument
          ?.getElementById("recording-pip-finish")
          ?.textContent?.trim(),
      ),
    )
    .toBe("Finish recording");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__testRecordingPipDocument?.querySelector(".recording-pip__timer")?.textContent,
      ),
    )
    .not.toBe(pausedTimer);

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-pause")?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(2);
  await page.evaluate(() => window.__testEndScreenShare());
  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(1);
  await expect(page.getByRole("heading", { name: "Recording paused" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume recording" })).toHaveCount(0);
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`microphone check unlocks screen sharing at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installMicrophoneFixture(page);
    await page.goto("/test/submission-palette?ds-user=user-avery&ds-recording=1");

    const appLink = page.locator(".test-session__link").first();
    const testerInstructions = page.locator(".test-session__instruction-list");
    const appLinkLabel = page.getByText("App link", { exact: true });
    const testerInstructionsLabel = page.getByText("Tester instructions", { exact: true });
    await expect(appLink).toBeVisible();
    await expect(appLink.locator(".test-session__link-label")).toHaveCount(0);
    expect(
      await appLink.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          borderWidth: styles.borderWidth,
          color: styles.color,
          padding: styles.padding,
        };
      }),
    ).toEqual({
      borderWidth: "0px",
      color: await testerInstructions.evaluate((element) => window.getComputedStyle(element).color),
      padding: "0px",
    });

    const appLinkLabelBounds = await appLinkLabel.boundingBox();
    const appLinkTextBounds = await appLink.locator("span").first().boundingBox();
    const testerInstructionsLabelBounds = await testerInstructionsLabel.boundingBox();
    const firstInstructionBounds = await testerInstructions.locator("li").first().boundingBox();
    expect(appLinkLabelBounds).not.toBeNull();
    expect(appLinkTextBounds).not.toBeNull();
    expect(testerInstructionsLabelBounds).not.toBeNull();
    expect(firstInstructionBounds).not.toBeNull();
    expect(Math.round((appLinkTextBounds?.y ?? 0) - (appLinkLabelBounds?.y ?? 0))).toBe(
      Math.round((firstInstructionBounds?.y ?? 0) - (testerInstructionsLabelBounds?.y ?? 0)),
    );

    const shareScreen = page.getByRole("button", { name: "Share screen" });
    const inactiveIndicator = page.getByRole("img", {
      name: "Microphone activity is inactive until microphone access is enabled",
    });
    const enableMicrophone = page.getByRole("button", { name: "Enable microphone" });
    await expect(inactiveIndicator).toBeVisible();
    expect(
      await inactiveIndicator
        .locator("span")
        .evaluateAll((bars) => bars.map((bar) => window.getComputedStyle(bar).height)),
    ).toEqual(["6px", "8px", "10px", "8px", "6px"]);

    const enableMicrophoneBounds = await enableMicrophone.boundingBox();
    const inactiveIndicatorBounds = await inactiveIndicator.boundingBox();
    expect(enableMicrophoneBounds).not.toBeNull();
    expect(inactiveIndicatorBounds).not.toBeNull();
    expect(inactiveIndicatorBounds?.height).toBe(enableMicrophoneBounds?.height);

    await enableMicrophone.click();
    const microphoneDevice = page.getByLabel("Microphone device");
    const activeIndicator = page.getByRole("img", {
      name: "Voice activity level for the selected microphone",
    });
    await expect(microphoneDevice).toBeVisible();
    await expect(
      page.getByText('Test your microphone, say something like "Test... 1 2 3..."', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(shareScreen).toBeDisabled();
    await expect(activeIndicator).toBeVisible();

    const microphoneDeviceBounds = await microphoneDevice.boundingBox();
    const activeIndicatorBounds = await activeIndicator.boundingBox();
    expect(microphoneDeviceBounds).not.toBeNull();
    expect(activeIndicatorBounds).not.toBeNull();
    expect(activeIndicatorBounds?.height).toBe(microphoneDeviceBounds?.height);

    await page.evaluate(() => {
      window.__testMicrophoneIsLoud = true;
    });

    const passedIndicator = page.getByRole("img", { name: "Microphone test passed" });
    await expect(passedIndicator).toBeVisible();
    await expect(passedIndicator.locator("span")).toHaveCount(0);
    const passedIndicatorBounds = await passedIndicator.boundingBox();
    expect(passedIndicatorBounds).not.toBeNull();
    expect(passedIndicatorBounds?.width).toBe(activeIndicatorBounds?.width);
    expect(passedIndicatorBounds?.height).toBe(activeIndicatorBounds?.height);
    await expect(shareScreen).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText(
      "Microphone test passed. Step 2 is now available.",
    );
    await expect(passedIndicator.locator(".recording-mic-indicator__check")).toHaveCSS(
      "position",
      "absolute",
    );

    await shareScreen.click();
    const screenShareIndicator = page.getByRole("img", { name: "Screen sharing active" });
    await expect(screenShareIndicator).toBeVisible();
    const screenShareIndicatorBounds = await screenShareIndicator.boundingBox();
    expect(screenShareIndicatorBounds).not.toBeNull();
    expect(screenShareIndicatorBounds?.width).toBe(passedIndicatorBounds?.width);
    expect(screenShareIndicatorBounds?.height).toBe(passedIndicatorBounds?.height);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}
