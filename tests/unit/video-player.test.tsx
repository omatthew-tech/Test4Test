import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VideoPlayer } from "@test4test/design-system";

afterEach(cleanup);
it("ends the preview at 15 seconds, clamps seeking and moves focus into its lock in the player", () => {
  render(
    <VideoPlayer
      label="Preview"
      src="/preview.mp4"
      durationHint={120}
      preview={{
        seconds: 15,
        overlay: (
          <>
            <h2>You're out of credits</h2>
            <button>Earn credits</button>
          </>
        ),
      }}
    />,
  );
  const video = screen.getByLabelText("Preview") as HTMLVideoElement;
  video.pause = vi.fn();
  Object.defineProperty(video, "duration", { configurable: true, value: 15 });
  fireEvent.loadedMetadata(video);
  video.currentTime = 14.9;
  fireEvent.timeUpdate(video);
  expect(screen.queryByRole("heading")).toBeNull();
  fireEvent.change(screen.getByRole("slider", { name: "Playback position" }), {
    target: { value: "90" },
  });
  expect(video.currentTime).toBe(15);
  expect(screen.getByRole("heading", { name: "You're out of credits" })).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("region", { name: "Recording preview ended" }),
  );
  expect(
    (screen.getByRole("slider", { name: "Playback position" }) as HTMLInputElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
  video.currentTime = 30;
  fireEvent.seeking(video);
  expect(video.currentTime).toBe(15);
});

it("shows the lock at the end of a recording shorter than the preview limit", () => {
  render(<VideoPlayer label="Short preview" preview={{ seconds: 15, overlay: <h2>Locked</h2> }} />);
  const video = screen.getByLabelText("Short preview") as HTMLVideoElement;
  Object.defineProperty(video, "ended", { configurable: true, value: true });
  fireEvent.ended(video);
  expect(screen.getByRole("heading", { name: "Locked" })).toBeTruthy();
});
function mount() {
  render(<VideoPlayer label="Recording" src="/recording.mp4" />);
  const video = screen.getByLabelText("Recording") as HTMLVideoElement;
  Object.defineProperty(video, "duration", { configurable: true, value: 120 });
  fireEvent.loadedMetadata(video);
  return video;
}
it("synchronizes playback, transcript-driven seeking and volume with native media events", () => {
  const video = mount();
  video.currentTime = 42;
  fireEvent.timeUpdate(video);
  expect(
    (screen.getByRole("slider", { name: "Playback position" }) as HTMLInputElement).value,
  ).toBe("42");
  fireEvent.change(screen.getByRole("slider", { name: "Playback position" }), {
    target: { value: "65" },
  });
  expect(video.currentTime).toBe(65);
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  fireEvent.play(video);
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Mute" }));
  fireEvent.volumeChange(video);
  expect(video.muted).toBe(true);
  fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "0.4" } });
  expect(video.volume).toBe(0.4);
  expect(video.muted).toBe(false);
});
it("announces a denied playback request and allows retry", async () => {
  const video = mount();
  video.play = vi.fn().mockRejectedValueOnce(new Error("Denied")).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(video.play).toHaveBeenCalledTimes(2);
});
it("keeps both clip handles and seeking in the player and enforces narrow-range boundaries", () => {
  const onChange = vi.fn();
  render(
    <VideoPlayer
      label="Recording"
      durationHint={120}
      clipRange={{ start: 20, end: 20.1, onChange }}
    />,
  );
  const player = screen.getByRole("group", { name: "Recording player" });
  const start = screen.getByRole("slider", { name: "Clip start" });
  expect(player.contains(start)).toBe(true);
  expect(player.contains(screen.getByRole("slider", { name: "Playback position" }))).toBe(true);
  fireEvent.keyDown(start, { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith(20, 20.1, "start");
  fireEvent.keyDown(screen.getByRole("slider", { name: "Clip end" }), { key: "ArrowLeft" });
  expect(onChange).toHaveBeenLastCalledWith(20, 20.1, "end");
});
