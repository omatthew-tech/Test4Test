import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordingClipEditor } from "../../src/pages/RecordingClipEditor";
import { SharedClipPage } from "../../src/pages/SharedClipPage";
import * as clips from "../../src/lib/recordingClips";

vi.mock("../../src/lib/recordingClips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/recordingClips")>()),
  saveRecordingClip: vi.fn(),
  getRecordingClipStatus: vi.fn(),
  retryRecordingClip: vi.fn(),
  deleteRecordingClip: vi.fn(),
  loadPublicClip: vi.fn(),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
let video: HTMLVideoElement;
const writeText = vi.fn();
beforeEach(() => {
  vi.mocked(clips.saveRecordingClip).mockReset().mockResolvedValue("pending");
  vi.mocked(clips.getRecordingClipStatus).mockReset().mockResolvedValue("ready");
  vi.mocked(clips.retryRecordingClip).mockReset().mockResolvedValue("pending");
  vi.mocked(clips.deleteRecordingClip).mockReset().mockResolvedValue(undefined);
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  video = document.createElement("video");
  Object.defineProperty(video, "duration", { value: 120, configurable: true });
  video.currentTime = 25;
  video.pause = vi.fn();
  video.play = vi.fn().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function mount() {
  return render(
    <MemoryRouter>
      <RecordingClipEditor video={video} responseId="response" durationHint={120} />
    </MemoryRouter>,
  );
}

it("starts at the paused position, clamps the range and saves a copyable link in a popup", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Clip" }));
  const start = screen.getByRole("slider", { name: "Clip start" });
  const end = screen.getByRole("slider", { name: "Clip end" });
  expect(start.getAttribute("aria-valuenow")).toBe("25");
  expect(end.getAttribute("aria-valuenow")).toBe("55");
  fireEvent.keyDown(start, { key: "ArrowLeft" });
  expect(video.currentTime).toBe(24.9);
  fireEvent.keyDown(end, { key: "End" });
  expect(end.getAttribute("aria-valuenow")).toBe("120");
  fireEvent.click(screen.getByRole("button", { name: "Save clip" }));
  const link = await screen.findByRole("textbox", { name: "Clip link" });
  expect(screen.getByRole("dialog", { name: "Share clip" })).toBeTruthy();
  const input = vi.mocked(clips.saveRecordingClip).mock.calls[0][0];
  expect(input.startMs).toBe(24900);
  expect(input.endMs).toBe(120000);
  expect((link as HTMLInputElement).value).toBe(
    `${window.location.origin}/clips/shared#${input.token}`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await screen.findByRole("button", { name: "Copied" });
  expect(writeText).toHaveBeenCalledWith((link as HTMLInputElement).value);
});
it("reuses the same request after an uncertain save and recovers from clipboard denial", async () => {
  vi.mocked(clips.saveRecordingClip).mockRejectedValueOnce(new Error("Connection lost"));
  writeText.mockRejectedValue(new Error("Denied"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Clip" }));
  fireEvent.click(screen.getByRole("button", { name: "Save clip" }));
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByRole("textbox", { name: "Clip link" });
  expect(vi.mocked(clips.saveRecordingClip).mock.calls[0][0]).toEqual(
    vi.mocked(clips.saveRecordingClip).mock.calls[1][0],
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByText(/copy it manually/)).toBeTruthy();
});
it("bounds a clip at the end and permits export retry and link revocation", async () => {
  video.currentTime = 120;
  vi.mocked(clips.saveRecordingClip).mockResolvedValue("failed");
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Clip" }));
  expect(screen.getByRole("slider", { name: "Clip start" }).getAttribute("aria-valuenow")).toBe(
    "119.9",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save clip" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry export" }));
  await waitFor(() => expect(clips.retryRecordingClip).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Delete clip" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(clips.deleteRecordingClip).toHaveBeenCalled();
});
it("does not expose a previous recording's share popup after navigation", async () => {
  let resolve!: (value: clips.ClipStatus) => void;
  vi.mocked(clips.saveRecordingClip).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { unmount } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Clip" }));
  fireEvent.click(screen.getByRole("button", { name: "Save clip" }));
  unmount();
  mount();
  await act(async () => {
    resolve("ready");
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("previews from the selected start and stops at the selected end", async () => {
  vi.useFakeTimers();
  Object.defineProperty(video, "paused", { value: false, configurable: true });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Clip" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Preview clip" }));
  });
  expect(video.currentTime).toBe(25);
  expect(video.play).toHaveBeenCalled();
  video.currentTime = 56;
  await act(async () => {
    vi.advanceTimersByTime(30);
  });
  expect(video.currentTime).toBe(55);
  expect(video.pause).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Preview clip" })).toBeTruthy();
});

it("public playback uses only the exported MP4 and offers reload for expired media URLs", async () => {
  vi.mocked(clips.loadPublicClip).mockResolvedValue({
    status: "ready",
    productName: "Example app",
    durationMs: 30000,
    url: "https://media.example/clip.mp4",
    downloadUrl: "https://media.example/download.mp4",
  });
  render(
    <MemoryRouter initialEntries={[`/clips/shared#${"a".repeat(64)}`]}>
      <SharedClipPage />
    </MemoryRouter>,
  );
  const player = await screen.findByLabelText("Example app clip");
  expect(player.getAttribute("src")).toBe("https://media.example/clip.mp4");
  expect(screen.getByRole("link", { name: "Download MP4" }).getAttribute("href")).toBe(
    "https://media.example/download.mp4",
  );
  fireEvent.error(player);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(clips.loadPublicClip).toHaveBeenCalledTimes(2));
});
