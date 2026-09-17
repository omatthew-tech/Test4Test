import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  paginateTranscript,
  transcriptPageAt,
  transcriptTokens,
  type RecordingTranscriptData,
} from "../../src/lib/recordingTranscript";
import { RecordingTranscript } from "../../src/pages/RecordingTranscript";

const api = vi.hoisted(() => ({ load: vi.fn(), retry: vi.fn() }));
vi.mock("../../src/lib/recordingTranscript", async (original) => ({
  ...(await original<typeof import("../../src/lib/recordingTranscript")>()),
  requestRecordingTranscript: api.load,
}));
vi.mock("../../src/lib/transcriptReports", async (original) => ({
  ...(await original<typeof import("../../src/lib/transcriptReports")>()),
  retryRecordingTranscript: api.retry,
}));
const data: RecordingTranscriptData = {
  id: "transcript",
  responseId: "response",
  source: { bucket: "r2:media", path: "recording.webm" },
  revision: "1",
  status: "ready",
  language: "en",
  fullText: "Hello, world! Another sentence.",
  segments: [
    { text: "Hello, world!", startMs: 500, endMs: 1800 },
    { text: "Another sentence.", startMs: 3000, endMs: 4500 },
  ],
  words: [
    { id: "1", sequence: 0, segmentIndex: 0, startMs: 500, endMs: 900, text: "Hello" },
    { id: "2", sequence: 1, segmentIndex: 0, startMs: 1200, endMs: 1800, text: "world" },
  ],
};
const props = {
  userId: "owner",
  responseId: "response",
  source: data.source,
  fixtureMode: false,
  fixtureScenario: null,
};
beforeEach(() => {
  api.load.mockReset().mockResolvedValue({ transcript: structuredClone(data) });
  api.retry.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = computedStyle(element);
    style.lineHeight = "24px";
    return style;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("preserves punctuation and reveals incomplete timing as a complete sentence", () => {
  const tokens = transcriptTokens(data);
  expect(tokens.map((token) => token.text).join("")).toBe(data.fullText);
  expect(tokens).toEqual([
    { text: "Hello", startMs: 500, endMs: 900 },
    { text: ", world!", startMs: 1200, endMs: 1800 },
    { text: " Another sentence.", startMs: 3000, endMs: 4500 },
  ]);
  expect(transcriptTokens({ ...data, words: data.words.slice(0, 1) })[0]).toMatchObject({
    text: "Hello, world!",
    startMs: 500,
  });
});

it("uses four actual lines per block and holds the last block", () => {
  const tokens = Array.from({ length: 10 }, (_, i) => ({
    text: "word",
    startMs: i * 1000,
    endMs: i * 1000 + 500,
  }));
  const pages = paginateTranscript(
    tokens,
    tokens.map((_, i) => ({ top: i * 24, bottom: i * 24 + 20 })),
    24,
  );
  expect(pages).toEqual([
    { start: 0, end: 4, endsAt: 3500 },
    { start: 4, end: 8, endsAt: 7500 },
    { start: 8, end: 10, endsAt: 9500 },
  ]);
  expect([0, 3499, 3500, 7500, 20000, 1000].map((time) => transcriptPageAt(pages, time))).toEqual([
    0, 0, 1, 2, 2, 0,
  ]);
});

it("follows media time while paused, seeking, changing speed, ending, and replaying", async () => {
  const video = document.createElement("video");
  const { container } = render(<RecordingTranscript {...props} video={video} />);
  await waitFor(() => expect(container.querySelectorAll("[data-spoken]")).toHaveLength(3));
  const spoken = () => container.querySelectorAll('[data-spoken="true"]').length;
  expect(spoken()).toBe(0);
  for (const [time, event, count] of [
    [0.5, "timeupdate", 1],
    [1.2, "pause", 2],
    [3, "seeked", 3],
    [0.1, "seeking", 0],
    [1.3, "ratechange", 2],
    [6, "ended", 3],
    [0, "seeked", 0],
  ] as const) {
    act(() => {
      video.currentTime = time;
      video.dispatchEvent(new Event(event));
    });
    expect(spoken()).toBe(count);
  }
  expect(api.load).toHaveBeenCalledTimes(1);
});

it("offers separate load retry and transcription retry", async () => {
  api.load.mockRejectedValueOnce(new Error("offline"));
  render(<RecordingTranscript {...props} video={null} />);
  fireEvent.click(await screen.findByRole("button", { name: "Reload transcript" }));
  await waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));
  expect(api.retry).not.toHaveBeenCalled();
  cleanup();
  api.load.mockResolvedValue({ transcript: { ...data, status: "failed" } });
  render(<RecordingTranscript {...props} video={null} />);
  api.retry.mockRejectedValueOnce(new Error("failed"));
  fireEvent.click(await screen.findByRole("button", { name: "Retry transcription" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Transcription could not be retried. Try again.",
  );
  api.load.mockResolvedValue({ transcript: data });
  fireEvent.click(screen.getByRole("button", { name: "Retry transcription" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Retry transcription" })).toBeNull(),
  );
});

it("discards late requests when the keyed recording changes", async () => {
  let resolve!: (result: { transcript: RecordingTranscriptData }) => void;
  api.load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { rerender } = render(<RecordingTranscript key="first" {...props} video={null} />);
  const firstSignal = api.load.mock.calls[0][3] as AbortSignal;
  api.load.mockResolvedValue({ transcript: null });
  rerender(<RecordingTranscript key="second" {...props} responseId="second" video={null} />);
  await screen.findByText("Transcript unavailable");
  await act(async () => resolve({ transcript: data }));
  expect(firstSignal.aborted).toBe(true);
  expect(screen.queryByText(data.fullText)).toBeNull();
});

it("rejects a transcript belonging to another source", async () => {
  api.load.mockResolvedValue({
    transcript: { ...data, source: { ...data.source, path: "old.webm" } },
  });
  render(<RecordingTranscript {...props} video={null} />);
  await screen.findByRole("button", { name: "Reload transcript" });
  expect(screen.queryByText(data.fullText)).toBeNull();
});

it("distinguishes no speech from text without timestamps", async () => {
  api.load.mockResolvedValueOnce({
    transcript: { ...data, fullText: "", segments: [], words: [] },
  });
  const { rerender } = render(<RecordingTranscript key="empty" {...props} video={null} />);
  await screen.findByText("No speech was detected in this recording.");
  api.load.mockResolvedValueOnce({ transcript: { ...data, segments: [], words: [] } });
  rerender(<RecordingTranscript key="untimed" {...props} video={null} />);
  expect((await screen.findByRole("region", { name: "Transcript text" })).textContent).toBe(
    data.fullText,
  );
});

it("polls preparing transcripts, pauses while hidden, and stops after ready", async () => {
  vi.useFakeTimers();
  api.load.mockResolvedValue({ transcript: { ...data, status: "processing" } });
  render(<RecordingTranscript {...props} video={null} />);
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(api.load).toHaveBeenCalledTimes(2);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {
    vi.advanceTimersByTime(15000);
  });
  expect(api.load).toHaveBeenCalledTimes(2);
  api.load.mockResolvedValue({ transcript: data });
  visibility.mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {
    vi.advanceTimersByTime(15000);
  });
  expect(api.load).toHaveBeenCalledTimes(3);
});
