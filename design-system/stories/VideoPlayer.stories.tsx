import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { Button, Stack, VideoPlayer } from "@test4test/design-system";

const meta = {
  title: "Components/Video player",
  component: VideoPlayer,
  args: { label: "Recording", src: "/videos/home-share-test.mp4", durationHint: 10 },
} satisfies Meta<typeof VideoPlayer>;
export default meta;
type Story = StoryObj<typeof meta>;

// @test4test-coverage video-player | sizes: responsive | variants: playback, clipping | states: paused, playing, muted, focus-visible, unavailable, fullscreen
export const VideoPlayerContract: Story = {
  render: function PlayerStory(args) {
    const [range, setRange] = useState<[number, number] | null>(null);
    return (
      <Stack>
        <VideoPlayer
          {...args}
          clipRange={
            range
              ? {
                  start: range[0],
                  end: range[1],
                  onChange: (start, end) => setRange([start, end]),
                }
              : undefined
          }
          actions={
            <Button variant="quiet" onClick={() => setRange(range ? null : [1, 2])}>
              {range ? "Cancel clip" : "Clip"}
            </Button>
          }
        />
        <VideoPlayer label="Unavailable recording" />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const player = within(within(canvasElement).getByRole("group", { name: "Recording player" }));
    const media = player.getByLabelText("Recording") as HTMLVideoElement;
    await waitFor(
      () => expect(media.readyState, `Media error: ${media.error?.code}`).toBeGreaterThan(0),
      { timeout: 10000 },
    );
    // Storybook uses synthetic clicks; mute first to satisfy browser autoplay policy.
    await userEvent.click(player.getByRole("button", { name: "Mute" }));
    await userEvent.click(player.getByRole("button", { name: "Play" }));
    await expect(await player.findByRole("button", { name: "Pause" })).toBeVisible();
    await userEvent.click(player.getByRole("button", { name: "Pause" }));
    await expect(player.getByRole("button", { name: "Unmute" })).toBeVisible();
    await userEvent.click(player.getByRole("button", { name: "Clip" }));
    const start = player.getByRole("slider", { name: "Clip start" });
    start.focus();
    await userEvent.keyboard("{End}");
    await expect(start).toHaveAttribute("aria-valuenow", "1.9");
    await expect(player.getByRole("slider", { name: "Playback position" })).toBeVisible();
    await expect(
      within(
        within(canvasElement).getByRole("group", { name: "Unavailable recording player" }),
      ).getByRole("slider", { name: "Playback position" }),
    ).toBeDisabled();
  },
};
