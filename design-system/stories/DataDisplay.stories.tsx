import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import {
  Badge,
  Card,
  List,
  Stack,
  StatusIndicator,
  Surface,
  Table,
  TechnicalValue,
} from "@test4test/design-system";

const meta = {
  title: "Components/Data display",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DataStates: Story = {
  render: () => (
    <Stack gap="lg">
      <Card>
        <Stack gap="sm">
          <h2>Checkout usability test</h2>
          <StatusIndicator tone="success">Collecting responses</StatusIndicator>
          <TechnicalValue>test_7H9K2</TechnicalValue>
          <Badge>Website</Badge>
        </Stack>
      </Card>
      <Table
        caption="Recent responses"
        headers={["Tester", "Completed", "Rating"]}
        rows={[
          ["Anonymous tester", "July 22, 2026", "4 of 5"],
          ["Anonymous tester", "July 21, 2026", "3 of 5"],
        ]}
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table", { name: "Recent responses" })).toBeVisible();
    await expect(canvas.getAllByRole("row")).toHaveLength(3);
    await expect(canvas.getByText("test_7H9K2")).toBeVisible();
    await expect(canvas.getByText("Collecting responses")).toBeVisible();
  },
};

// @test4test-coverage card | sizes: responsive | variants: bordered, raised | states: default, long-content, narrow-width
export const CardContract: Story = {
  render: () => (
    <Stack>
      <Card as="article" aria-label="Default card">
        Default grouped content with deliberately longer copy that wraps safely when the story is
        rendered at the narrow baseline.
      </Card>
      <Card as="article" raised aria-label="Raised card">
        Raised content used only for hierarchy.
      </Card>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("article", { name: "Default card" })).toBeVisible();
    await expect(canvas.getByRole("article", { name: "Raised card" })).toBeVisible();
  },
};

// @test4test-coverage surface | sizes: none, compact, default | variants: default, subtle, raised | states: default, long-content, narrow-width
export const SurfaceContract: Story = {
  render: () => (
    <Stack>
      <Surface>Default surface</Surface>
      <Surface padding="none">Surface without internal padding</Surface>
      <Surface tone="subtle" padding="compact">
        Subtle compact surface
      </Surface>
      <Surface tone="raised">
        Raised surface with deliberately longer content that remains readable without overflow at
        narrow widths.
      </Surface>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Default surface")).toBeVisible();
    await expect(canvas.getByText(/Raised surface with deliberately longer/)).toBeVisible();
  },
};

// @test4test-coverage table | sizes: responsive | variants: scroll-container | states: populated, long-content, narrow-width
export const TableContract: Story = {
  render: () => (
    <Table
      caption="Responses with long content"
      headers={["Tester", "Finding"]}
      rows={[
        [
          "Anonymous tester",
          "The checkout confirmation did not explain whether the order had been placed.",
        ],
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table", { name: "Responses with long content" })).toBeVisible();
    await expect(canvas.getAllByRole("row")).toHaveLength(2);
  },
};

// @test4test-coverage list | sizes: responsive | variants: unordered, ordered | states: populated, long-content
export const ListContract: Story = {
  render: () => (
    <Stack>
      <List>
        <li>First finding</li>
        <li>
          Second finding with intentionally longer content that wraps without losing the semantic
          list relationship.
        </li>
      </List>
      <List ordered>
        <li>Open the test</li>
        <li>Complete the task</li>
      </List>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("list")).toHaveLength(2);
  },
};

// @test4test-coverage badge | sizes: compact | variants: neutral, info, success, warning, danger | states: default, long-content
export const BadgeContract: Story = {
  render: () => (
    <Stack>
      <Badge>Draft</Badge>
      <Badge tone="info">Invitation sent</Badge>
      <Badge tone="success">Complete</Badge>
      <Badge tone="warning">Needs review</Badge>
      <Badge tone="danger">Failed</Badge>
      <Badge tone="info">Invitation sent to a deliberately long workspace name</Badge>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Needs review")).toBeVisible();
  },
};

// @test4test-coverage status-indicator | sizes: compact | variants: neutral, info, success, warning, danger | states: default, long-content
export const StatusIndicatorContract: Story = {
  render: () => (
    <Stack>
      <StatusIndicator>Closed</StatusIndicator>
      <StatusIndicator tone="info">Preparing</StatusIndicator>
      <StatusIndicator tone="success">Collecting responses</StatusIndicator>
      <StatusIndicator tone="warning">Upload paused</StatusIndicator>
      <StatusIndicator tone="danger">Upload failed</StatusIndicator>
      <StatusIndicator tone="info">
        Preparing a deliberately long recording identifier for upload
      </StatusIndicator>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Upload failed")).toBeVisible();
  },
};

// @test4test-coverage technical-value | sizes: responsive | variants: code, custom-element | states: default, long-content
export const TechnicalValueContract: Story = {
  render: () => (
    <Stack>
      <TechnicalValue>
        response_7H9K2_with_an_intentionally_long_identifier_that_must_wrap_without_overflow
      </TechnicalValue>
      <TechnicalValue as="span">custom_element_technical_value</TechnicalValue>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/response_7H9K2/)).toBeVisible();
    await expect(canvas.getByText("custom_element_technical_value").tagName).toBe("SPAN");
  },
};
