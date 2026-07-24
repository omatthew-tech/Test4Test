import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Settings } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { Button, Cluster, IconButton, Link, Stack } from "@test4test/design-system";

const meta = {
  title: "Components/Actions",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <Stack gap="lg">
      <Cluster>
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary action</Button>
        <Button variant="quiet">Quiet action</Button>
        <Button variant="danger">Delete test</Button>
      </Cluster>
      <Cluster>
        <Button size="compact">Compact</Button>
        <Button size="large">Large</Button>
        <Button disabled>Disabled</Button>
        <Button loading>Save changes</Button>
      </Cluster>
      <Cluster>
        <IconButton label="Open settings">
          <Settings aria-hidden="true" size={20} />
        </IconButton>
        <Link to="/example">
          View test <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </Cluster>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Primary action" }));
    await expect(canvas.getByRole("button", { name: "Disabled" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Working" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(canvas.getByRole("button", { name: "Open settings" })).toHaveAccessibleName(
      "Open settings",
    );
    await expect(canvas.getByRole("link", { name: /View test/ })).toHaveAttribute(
      "href",
      "/example",
    );
  },
};

// @test4test-coverage button | sizes: compact, default, large | variants: primary, secondary, quiet, danger | states: enabled, hover, focus-visible, pressed, disabled, loading
export const ButtonContract: Story = {
  render: () => (
    <Stack gap="lg">
      <Cluster>
        <Button size="compact">Compact primary</Button>
        <Button>Default primary</Button>
        <Button size="large">Large primary</Button>
      </Cluster>
      <Cluster>
        <Button variant="secondary">Secondary action</Button>
        <Button variant="quiet">Quiet action</Button>
        <Button variant="danger">Delete test</Button>
      </Cluster>
      <Cluster>
        <Button disabled>Disabled action</Button>
        <Button loading loadingLabel="Saving test">
          Save test
        </Button>
      </Cluster>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const primary = canvas.getByRole("button", { name: "Default primary" });
    await expect(canvas.getByRole("button", { name: "Compact primary" })).toBeEnabled();
    await userEvent.hover(primary);
    primary.focus();
    await expect(primary).toHaveFocus();
    await expect(canvas.getByRole("button", { name: "Disabled action" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Saving test" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  },
};

// @test4test-coverage icon-button | sizes: compact, default, large | variants: secondary, quiet, danger | states: enabled, hover, focus-visible, pressed, disabled
export const IconButtonContract: Story = {
  render: () => (
    <Cluster>
      <IconButton label="Open settings" size="compact">
        <Settings aria-hidden="true" size={16} />
      </IconButton>
      <IconButton label="Quiet settings" variant="quiet">
        <Settings aria-hidden="true" size={20} />
      </IconButton>
      <IconButton label="Delete settings" size="large" variant="danger">
        <Settings aria-hidden="true" size={24} />
      </IconButton>
      <IconButton disabled label="Disabled settings">
        <Settings aria-hidden="true" size={20} />
      </IconButton>
    </Cluster>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole("button", { name: "Open settings" });
    control.focus();
    await expect(control).toHaveFocus();
    await userEvent.hover(control);
    await expect(canvas.getByRole("button", { name: "Delete settings" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Disabled settings" })).toBeDisabled();
  },
};

// @test4test-coverage link | sizes: default | variants: internal, external | states: default, hover, focus-visible, visited, long-content
export const LinkContract: Story = {
  render: () => (
    <Stack>
      <Link to="/my-tests">Review test responses</Link>
      <Link external rel="noreferrer" target="_blank" to="https://example.com">
        Open testing website
      </Link>
      <Link to="/my-tests/checkout-usability">
        Review a deliberately long checkout usability test link that wraps safely without obscuring
        its destination
      </Link>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const internalLink = canvas.getByRole("link", { name: "Review test responses" });
    await expect(internalLink).toHaveAttribute("href", "/my-tests");
    await userEvent.hover(internalLink);
    internalLink.focus();
    await expect(internalLink).toHaveFocus();
    await expect(canvas.getByRole("link", { name: "Open testing website" })).toHaveAttribute(
      "target",
      "_blank",
    );
  },
};
