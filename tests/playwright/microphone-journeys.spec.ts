import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

declare global {
  interface Window {
    __testMicrophoneIsLoud: boolean;
    __testMediaRecorderStartCount: number;
    __testMediaRecorderPauseCount: number;
    __testMediaRecorderResumeCount: number;
    __testMediaRecorderStopCount: number;
    __testDownloadedRecordingFileName: string | null;
    __testRecordingPipHeight: number;
    __testRecordingPipDocument: Document | null;
    __testRecordingUploadControl?: {
      fail: () => void;
      setProgress: (percentage: number, state?: "uploading" | "retrying" | "finalizing") => void;
      succeed: () => void;
    };
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
    window.__testDownloadedRecordingFileName = null;
    window.__testRecordingPipHeight = 300;
    window.__testRecordingPipDocument = null;

    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function testRecordingDownload() {
      if (this.download) {
        window.__testDownloadedRecordingFileName = this.download;
        return;
      }

      anchorClick.call(this);
    };

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
            get innerHeight() {
              return window.__testRecordingPipHeight;
            },
            get outerHeight() {
              return window.__testRecordingPipHeight;
            },
            outerWidth: 360,
            requestAnimationFrame: (callback: FrameRequestCallback) => {
              callback(0);
              return 1;
            },
            resizeTo: (width: number, height: number) => {
              window.__testRecordingPipHeight = height;
              pipFrame.style.width = `${width}px`;
              pipFrame.style.height = `${height}px`;
            },
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

async function startAndFinishNativeRecording(page: Page) {
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.evaluate(() => {
    window.__testMicrophoneIsLoud = true;
  });
  await expect(page.getByRole("img", { name: "Microphone test passed" })).toBeVisible();
  await page.getByRole("button", { name: "Share screen" }).click();
  await page.getByRole("button", { name: "Get started" }).click();
  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-start")?.click();
  });
  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-start-task")?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(1);
  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-finish")?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(1);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`upload confirmation and saved-recording dropdown at ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await installMicrophoneFixture(page);
    await page.goto(
      "/test/submission-palette?ds-user=user-avery&ds-recording=1&ds-recording-upload=controlled",
    );
    await startAndFinishNativeRecording(page);
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
      .toBe(true);
    await page.evaluate(() => window.__testRecordingUploadControl?.setProgress(100, "finalizing"));
    await expect(page.getByText("Confirming recording is saved", { exact: true })).toBeVisible();
    const disclosure = page.locator("summary").filter({ hasText: "Already recorded?" });
    await disclosure.press("Enter");
    await expect(page.getByLabel("Upload saved recording")).toBeVisible();
    await expect(page.getByLabel("Upload saved recording")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Download backup", exact: true })).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          status: window.__testRecordingPipDocument?.getElementById("recording-pip-upload-status")
            ?.textContent,
          enabledSubmit: Boolean(
            window.__testRecordingPipDocument?.querySelector(
              "button:not(:disabled)#recording-pip-submit",
            ),
          ),
        })),
      )
      .toEqual({ status: "Confirming recording is saved", enabledSubmit: false });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window.__testRecordingPipDocument?.documentElement.scrollHeight ?? 0) <=
            window.__testRecordingPipHeight,
        ),
      )
      .toBe(true);
    await expect(disclosure).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include(".test-layout").analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`upload-confirmation-${viewport.width}.png`),
      fullPage: true,
    });
    await page.evaluate(() => window.__testRecordingUploadControl?.succeed());
    await expect(page.getByRole("button", { name: "Submit test", exact: true })).toBeEnabled();
  });

  for (const revision of [false, true]) {
    test(`recording-only ${revision ? "revision" : "legacy test"} unlocks submit without answers at ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await installMicrophoneFixture(page);
      const path = revision
        ? "/submissions/response-palette-1/revise?ds-revision=1"
        : "/test/submission-palette?legacy=1";
      await page.goto(`${path}&ds-user=user-avery&ds-recording-upload=controlled`);
      await startAndFinishNativeRecording(page);
      await expect
        .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
        .toBe(true);
      await page.evaluate(() => window.__testRecordingUploadControl?.succeed());
      const label = revision ? "Submit revised recording" : "Submit test";
      await expect(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
      await expect(
        page.getByPlaceholder("Add a thoughtful answer with enough detail to be genuinely useful."),
      ).toHaveCount(0);
      await expect(page.locator(".test-session__questions")).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window.__testRecordingPipDocument?.getElementById(
                  "recording-pip-submit",
                ) as HTMLButtonElement
              )?.disabled,
          ),
        )
        .toBe(false);
      await page.reload();
      await expect(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
    });
  }
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

  const recordingCard = page.locator(".recording-phase-card");
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
        startButtonArrow: Boolean(
          window.__testRecordingPipDocument
            ?.getElementById("recording-pip-start")
            ?.querySelector('svg[aria-hidden="true"]'),
        ),
        title: window.__testRecordingPipDocument?.title,
      })),
    )
    .toEqual({
      finishButton: null,
      startButton: "Click here to start",
      startButtonArrow: false,
      title: "Ready to record",
    });

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-start")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(0);
  await expect(recordingCard.getByRole("heading", { name: "Task 1 of 1" })).toBeVisible();
  await expect(
    recordingCard.getByText("Create a board and inspect how easy it is to add references.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(recordingCard.getByRole("button", { name: "Start task" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        finishButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-finish"),
        ),
        focusedAction: window.__testRecordingPipDocument?.activeElement?.id,
        pauseButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-pause"),
        ),
        progress: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__instruction-position")
          ?.textContent?.trim(),
        startTask: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-start-task")
          ?.textContent?.trim(),
        timer: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__timer")
          ?.textContent?.trim(),
      })),
    )
    .toEqual({
      finishButton: false,
      focusedAction: "recording-pip-start-task",
      pauseButton: false,
      progress: "Task 1 of 1",
      startTask: "Start task",
      timer: "00:00",
    });
  await page.waitForTimeout(1100);
  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__testRecordingPipDocument?.querySelector(".recording-pip__timer")?.textContent,
      ),
    )
    .toBe("00:00");

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-start-task")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(1);
  await expect(recordingCard.getByRole("heading", { name: "Task 1 of 1" })).toBeVisible();
  await expect(recordingCard.getByRole("button", { name: "Finish recording" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        finishButton: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-finish")
          ?.textContent?.trim(),
        pauseButtonLabel: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-pause")
          ?.getAttribute("aria-label"),
        focusedAction: window.__testRecordingPipDocument?.activeElement?.id,
        instruction: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-instruction")
          ?.textContent?.trim(),
        instructionProgress: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__instruction-position")
          ?.textContent?.trim(),
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
      focusedAction: "recording-pip-finish",
      instruction: "Create a board and inspect how easy it is to add references.",
      instructionProgress: "Task 1 of 1",
      pauseButtonLabel: "Pause recording",
      startButton: false,
      title: "Recording live",
    });

  const activeTimer = await page.evaluate(
    () => window.__testRecordingPipDocument?.querySelector(".recording-pip__timer")?.textContent,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__testRecordingPipDocument?.querySelector(".recording-pip__timer")?.textContent,
      ),
    )
    .not.toBe(activeTimer);
  await expect
    .poll(() => page.evaluate(() => window.__testRecordingPipDocument?.activeElement?.id))
    .toBe("recording-pip-finish");

  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-pause")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(1);
  await expect(page.getByRole("heading", { name: "Recording paused" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish recording" })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Task 1 of 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish recording" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        finishButton: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-finish")
          ?.textContent?.trim(),
        instruction: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-instruction")
          ?.textContent?.trim(),
      })),
    )
    .toEqual({
      finishButton: "Finish recording",
      instruction: "Create a board and inspect how easy it is to add references.",
    });
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

test("upload recovery disclosure preserves focus and downloads a backup without stopping upload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMicrophoneFixture(page);
  await page.goto(
    "/test/submission-palette?ds-user=user-avery&ds-recording=1&ds-recording-upload=controlled",
  );
  await startAndFinishNativeRecording(page);

  await expect
    .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        chevronHidden:
          window.__testRecordingPipDocument
            ?.querySelector(".recording-pip__recovery-chevron")
            ?.getAttribute("aria-hidden") ?? null,
        downloadLabel:
          window.__testRecordingPipDocument
            ?.getElementById("recording-pip-download")
            ?.textContent?.trim() ?? null,
        help:
          window.__testRecordingPipDocument
            ?.querySelector(".recording-pip__recovery-help")
            ?.textContent?.trim() ?? null,
        open: (
          window.__testRecordingPipDocument?.getElementById(
            "recording-pip-upload-recovery",
          ) as HTMLDetailsElement | null
        )?.open,
        summaryTag: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-upload-recovery-summary")
          ?.tagName.toLowerCase(),
        summaryText:
          window.__testRecordingPipDocument
            ?.getElementById("recording-pip-upload-recovery-summary")
            ?.textContent?.trim() ?? null,
        title:
          window.__testRecordingPipDocument
            ?.querySelector(".recording-pip__recovery-title")
            ?.textContent?.trim() ?? null,
      })),
    )
    .toEqual({
      chevronHidden: "true",
      downloadLabel: "Download",
      help: "Go to the test's page and upload the recording for full credit.",
      open: false,
      summaryTag: "summary",
      summaryText: "Experiencing an error?",
      title: "Download recording",
    });

  const compactHeight = await page.evaluate(() => window.__testRecordingPipHeight);
  await page.evaluate(() => {
    window.__testRecordingPipDocument
      ?.getElementById("recording-pip-upload-recovery-summary")
      ?.focus();
  });
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window.__testRecordingPipDocument?.getElementById(
              "recording-pip-upload-recovery",
            ) as HTMLDetailsElement | null
          )?.open,
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__testRecordingPipHeight))
    .toBeGreaterThan(compactHeight);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pipDocument = window.__testRecordingPipDocument;
        return Boolean(
          pipDocument &&
          pipDocument.documentElement.scrollHeight <= window.__testRecordingPipHeight,
        );
      }),
    )
    .toBe(true);

  await page.evaluate(() => {
    const download = window.__testRecordingPipDocument?.getElementById("recording-pip-download");
    download?.setAttribute("data-progress-stable", "true");
    download?.focus();
    window.__testRecordingUploadControl?.setProgress(55, "retrying");
  });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        activeElement: window.__testRecordingPipDocument?.activeElement?.id,
        open: (
          window.__testRecordingPipDocument?.getElementById(
            "recording-pip-upload-recovery",
          ) as HTMLDetailsElement | null
        )?.open,
        stableNode: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-download")
          ?.getAttribute("data-progress-stable"),
        status: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-upload-status")
          ?.textContent?.trim(),
      })),
    )
    .toEqual({
      activeElement: "recording-pip-download",
      open: true,
      stableNode: "true",
      status: "Retrying upload",
    });
  await page.evaluate(() => {
    window.__testRecordingPipDocument?.getElementById("recording-pip-download")?.click();
  });
  await expect
    .poll(() => page.evaluate(() => window.__testDownloadedRecordingFileName))
    .toMatch(/^screen-recording-.+\.webm$/);
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
    .toBe(true);

  await page.evaluate(() => {
    window.__testRecordingPipDocument
      ?.getElementById("recording-pip-upload-recovery-summary")
      ?.focus();
  });
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window.__testRecordingPipDocument?.getElementById(
              "recording-pip-upload-recovery",
            ) as HTMLDetailsElement | null
          )?.open,
      ),
    )
    .toBe(false);
  await expect.poll(() => page.evaluate(() => window.__testRecordingPipHeight)).toBe(compactHeight);

  await page.evaluate(() => window.__testRecordingUploadControl?.succeed());
  await expect
    .poll(() => page.evaluate(() => window.__testRecordingPipDocument?.title))
    .toBe("Recording uploaded");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(window.__testRecordingPipDocument?.getElementById("recording-pip-upload-recovery")),
      ),
    )
    .toBe(false);
});

test("failed automatic upload exposes manual backup upload on the test page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMicrophoneFixture(page);
  await page.goto(
    "/test/submission-palette?ds-user=user-avery&ds-recording=1&ds-recording-upload=controlled",
  );
  await startAndFinishNativeRecording(page);

  await expect
    .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
    .toBe(true);
  await page.evaluate(() => window.__testRecordingUploadControl?.fail());

  const manualUpload = page.getByLabel("Upload a saved backup file");
  await expect(manualUpload).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry upload" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download backup" })).toBeVisible();
  await manualUpload.setInputFiles({
    name: "saved-recording.webm",
    mimeType: "video/webm",
    buffer: Buffer.from("saved recording"),
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__testRecordingUploadControl)))
    .toBe(true);
  await page.evaluate(() => window.__testRecordingUploadControl?.succeed());

  await expect(page.getByRole("heading", { name: "RECORDING UPLOADED" })).toBeVisible();
  await expect(manualUpload).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry upload" })).toHaveCount(0);
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`tester tasks advance in sync with a ready state before each recording segment at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installMicrophoneFixture(page);
    await page.goto(
      "/test/submission-palette?ds-user=user-avery&ds-recording=1&ds-instructions=multiple",
    );

    await page.getByRole("button", { name: "Enable microphone" }).click();
    await page.evaluate(() => {
      window.__testMicrophoneIsLoud = true;
    });
    await expect(page.getByRole("img", { name: "Microphone test passed" })).toBeVisible();
    await page.getByRole("button", { name: "Share screen" }).click();
    await page.getByRole("button", { name: "Get started" }).click();
    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-start")?.click();
    });

    const recordingCard = page.locator(".recording-phase-card");
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(0);
    await expect(recordingCard.getByRole("heading", { name: "Task 1 of 3" })).toBeVisible();
    await expect(recordingCard.getByText("Create a new moodboard.", { exact: true })).toBeVisible();
    await expect(recordingCard.getByRole("button", { name: "Start task" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          focusedAction: window.__testRecordingPipDocument?.activeElement?.id,
          pauseButton: Boolean(
            window.__testRecordingPipDocument?.getElementById("recording-pip-pause"),
          ),
          progress: window.__testRecordingPipDocument
            ?.querySelector(".recording-pip__instruction-position")
            ?.textContent?.trim(),
          startTask: window.__testRecordingPipDocument
            ?.getElementById("recording-pip-start-task")
            ?.textContent?.trim(),
          timer: window.__testRecordingPipDocument
            ?.querySelector(".recording-pip__timer")
            ?.textContent?.trim(),
        })),
      )
      .toEqual({
        focusedAction: "recording-pip-start-task",
        pauseButton: false,
        progress: "Task 1 of 3",
        startTask: "Start task",
        timer: "00:00",
      });

    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-start-task")?.click();
    });

    const readPipInstruction = () =>
      page.evaluate(() => ({
        finishButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-finish"),
        ),
        focusedAction: window.__testRecordingPipDocument?.activeElement?.id,
        instruction: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-instruction")
          ?.textContent?.trim(),
        instructionChildCount: window.__testRecordingPipDocument?.getElementById(
          "recording-pip-instruction",
        )?.childElementCount,
        nextButton: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-next")
          ?.textContent?.trim(),
        nextButtonSlate: Boolean(
          window.__testRecordingPipDocument
            ?.getElementById("recording-pip-next")
            ?.classList.contains("recording-pip__button--task-finish"),
        ),
        pauseButton: Boolean(
          window.__testRecordingPipDocument?.getElementById("recording-pip-pause"),
        ),
        progress: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__instruction-position")
          ?.textContent?.trim(),
        startTask: window.__testRecordingPipDocument
          ?.getElementById("recording-pip-start-task")
          ?.textContent?.trim(),
        timer: window.__testRecordingPipDocument
          ?.querySelector(".recording-pip__timer")
          ?.textContent?.trim(),
      }));

    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(1);
    await expect(recordingCard.getByRole("heading", { name: "Task 1 of 3" })).toBeVisible();
    await expect(recordingCard.getByText("Create a new moodboard.", { exact: true })).toBeVisible();
    await expect(
      recordingCard.getByRole("button", { name: "Complete task", exact: true }),
    ).toBeVisible();
    await expect.poll(readPipInstruction).toMatchObject({
      finishButton: false,
      focusedAction: "recording-pip-next",
      instruction: "Create a new moodboard.",
      instructionChildCount: 0,
      nextButton: "Complete task",
      nextButtonSlate: true,
      pauseButton: true,
      progress: "Task 1 of 3",
      startTask: undefined,
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const instruction = window.__testRecordingPipDocument?.getElementById(
            "recording-pip-instruction",
          );
          const instructionMain = window.__testRecordingPipDocument?.querySelector(
            ".recording-pip__main--instruction",
          );
          const pipWindow = window.__testRecordingPipDocument?.defaultView;

          if (!instruction || !instructionMain || !pipWindow) {
            return null;
          }

          const instructionStyles = pipWindow.getComputedStyle(instruction);
          const instructionMainStyles = pipWindow.getComputedStyle(instructionMain);
          return {
            contentFits: instructionMain.scrollHeight <= instructionMain.clientHeight,
            fontSize: instructionStyles.fontSize,
            fontWeight: instructionStyles.fontWeight,
            overflowY: instructionMainStyles.overflowY,
          };
        }),
      )
      .toEqual({ contentFits: true, fontSize: "14.4px", fontWeight: "400", overflowY: "visible" });

    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-next")?.click();
    });

    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(1);
    await expect(recordingCard.getByRole("heading", { name: "Task 2 of 3" })).toBeVisible();
    await expect(
      recordingCard.getByText("Add two visual references to the board.", { exact: true }),
    ).toBeVisible();
    await expect(recordingCard.getByRole("button", { name: "Start task" })).toBeVisible();
    await expect.poll(readPipInstruction).toMatchObject({
      finishButton: false,
      focusedAction: "recording-pip-start-task",
      instruction: "Add two visual references to the board.",
      instructionChildCount: 0,
      nextButton: undefined,
      nextButtonSlate: false,
      pauseButton: false,
      progress: "Task 2 of 3",
      startTask: "Start task",
    });
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStartCount)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(0);

    const taskTwoReadyTimer = await page.evaluate(
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
      .toBe(taskTwoReadyTimer);

    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-start-task")?.click();
    });
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(1);
    await expect(
      recordingCard.getByRole("button", { name: "Complete task", exact: true }),
    ).toBeVisible();
    await expect.poll(readPipInstruction).toMatchObject({
      focusedAction: "recording-pip-next",
      nextButton: "Complete task",
      nextButtonSlate: true,
      pauseButton: true,
      progress: "Task 2 of 3",
      startTask: undefined,
    });

    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-pause")?.click();
    });
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(2);
    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-resume")?.click();
    });
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(2);
    await expect(recordingCard.getByRole("heading", { name: "Task 2 of 3" })).toBeVisible();
    await expect.poll(readPipInstruction).toMatchObject({
      instruction: "Add two visual references to the board.",
      instructionChildCount: 0,
      nextButton: "Complete task",
      nextButtonSlate: true,
      progress: "Task 2 of 3",
    });

    await recordingCard.getByRole("button", { name: "Complete task", exact: true }).click();

    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(3);
    await expect(recordingCard.getByRole("heading", { name: "Task 3 of 3" })).toBeVisible();
    await expect(
      recordingCard.getByText(
        "Invite a collaborator and review <strong>sharing controls</strong>.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(recordingCard.getByRole("button", { name: "Start task" })).toBeFocused();
    await expect.poll(readPipInstruction).toMatchObject({
      finishButton: false,
      focusedAction: "",
      instruction: "Invite a collaborator and review <strong>sharing controls</strong>.",
      instructionChildCount: 0,
      nextButton: undefined,
      nextButtonSlate: false,
      pauseButton: false,
      progress: "Task 3 of 3",
      startTask: "Start task",
    });
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(2);
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(0);

    await recordingCard.getByRole("button", { name: "Start task" }).click();
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(3);
    await expect(recordingCard.getByRole("button", { name: "Finish recording" })).toBeFocused();
    await expect.poll(readPipInstruction).toMatchObject({
      finishButton: true,
      instruction: "Invite a collaborator and review <strong>sharing controls</strong>.",
      nextButton: undefined,
      nextButtonSlate: false,
      pauseButton: true,
      progress: "Task 3 of 3",
      startTask: undefined,
    });

    await page.evaluate(() => {
      window.__testRecordingPipDocument?.getElementById("recording-pip-finish")?.click();
    });
    await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(1);
  });
}

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
