import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __testMicrophoneIsLoud: boolean;
  }
}

async function installMicrophoneFixture(page: Page) {
  await page.addInitScript(() => {
    window.__testMicrophoneIsLoud = false;

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
      getSettings: () => ({ deviceId: "test-microphone" }),
      readyState: "live",
      stop: () => undefined,
    };
    const microphoneStream = {
      getAudioTracks: () => [microphoneTrack],
      getTracks: () => [microphoneTrack],
    };

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
        getDisplayMedia: async () => microphoneStream,
        getUserMedia: async () => microphoneStream,
      },
    });
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
      page.getByText("Test your microphone by speaking out loud", { exact: true }),
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
    await expect(shareScreen).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText(
      "Microphone test passed. Step 2 is now available.",
    );
    await expect(passedIndicator.locator(".recording-mic-indicator__check")).toHaveCSS(
      "position",
      "absolute",
    );

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}
