import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Stack, TimelineRange } from "@test4test/design-system";

const meta = {
  title: "Components/Timeline range",
  component: TimelineRange,
  args: { label: "Clip range", duration: 120, start: 20, end: 50, onChange: () => {} },
} satisfies Meta<typeof TimelineRange>;
export default meta;
type Story = StoryObj<typeof meta>;

// @test4test-coverage timeline-range | sizes: default | variants: media | states: enabled, focus-visible, disabled, narrow-range
export const TimelineRangeContract: Story = {
  render: function RangeStory(args) {
    const [range, setRange] = useState([args.start, args.end]);
    return (
      <Stack>
        <TimelineRange
          {...args}
          start={range[0]}
          end={range[1]}
          onChange={(start, end) => setRange([start, end])}
        />
        <TimelineRange {...args} label="Unavailable range" disabled />
        <TimelineRange {...args} label="Short selection" start={40} end={40.1} />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = within(canvas.getByRole("group", { name: "Clip range" }));
    const start = group.getByRole("slider", { name: "Clip start" });
    start.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(start).toHaveAttribute("aria-valuenow", "20.1");
    await userEvent.keyboard("{End}");
    await expect(start).toHaveAttribute("aria-valuenow", "49.9");
    const end = group.getByRole("slider", { name: "Clip end" });
    end.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(end).toHaveAttribute("aria-valuenow", "50");
    await expect(
      within(canvas.getByRole("group", { name: "Unavailable range" })).getByRole("slider", {
        name: "Clip start",
      }),
    ).toBeDisabled();
  },
};
