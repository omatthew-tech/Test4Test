import { afterEach, expect, it, vi } from "vitest";
import { earnTestHref, testFeedbackSource } from "../../src/lib/feedbackSource";
import { loadRecordingTestSession, saveRecordingTestSession } from "../../src/lib/recordings";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllEnvs();
});
it("marks Earn and test-back links, while shared links override signed-in recovery", () => {
  expect(earnTestHref("app")).toBe("/test/app?feedback_source=earn");
  expect(testFeedbackSource(false, new URLSearchParams("feedback_source=earn"))).toBe("earn");
  expect(testFeedbackSource(true, new URLSearchParams("feedback_source=earn"), "earn")).toBe(
    "shared_link",
  );
  expect(testFeedbackSource(false, new URLSearchParams())).toBe("shared_link");
});
it("preserves source while resuming a recording after reload or authentication", () => {
  saveRecordingTestSession({
    submissionId: "app",
    sessionId: "session",
    phase: "preflight",
    chosenProductType: null,
    confirmedRecording: false,
    recording: null,
    feedbackSource: "earn",
  });
  const recovered = loadRecordingTestSession("app");
  expect(testFeedbackSource(false, new URLSearchParams(), recovered?.feedbackSource)).toBe("earn");
});
