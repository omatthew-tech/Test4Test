import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Button, Cluster, Dialog, Drawer, Popover, Stack, Tooltip } from "@test4test/design-system";

const meta = {
  title: "Components/Overlays",
  component: Dialog,
  args: {
    open: false,
    onOpenChange: () => undefined,
    title: "Dialog title",
    children: "Dialog content",
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverlayPatterns: Story = {
  render: function OverlayPatternsStory() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    return (
      <Stack gap="lg">
        <Cluster>
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Popover label="Share options" trigger={<Button variant="secondary">Share</Button>}>
            <p>Anyone with the link can open the test.</p>
          </Popover>
          <Tooltip content="Copies the public test link">
            <Button variant="quiet">Copy link</Button>
          </Tooltip>
        </Cluster>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Delete this test?"
          description="This removes the test and its public link. Responses remain available."
          footer={
            <Cluster>
              <Button variant="danger">Delete test</Button>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </Cluster>
          }
        >
          <p>Checkout usability test</p>
        </Dialog>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Test settings">
          <p>Drawer content remains keyboard reachable.</p>
        </Drawer>
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openDialog = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.click(openDialog);
    await expect(
      within(document.body).getByRole("dialog", { name: "Delete this test?" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(openDialog).toHaveFocus();

    await userEvent.click(canvas.getByRole("button", { name: "Share" }));
    await expect(canvas.getByRole("dialog", { name: "Share options" })).toHaveTextContent(
      "Anyone with the link",
    );
  },
};

// @test4test-coverage dialog | sizes: responsive | variants: dialog | states: closed, open, focus-contained, long-content, destructive
export const DialogContract: Story = {
  render: function DialogContractStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open confirmation</Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Delete this test?"
          description="This removes the public test link."
          footer={
            <Cluster>
              <Button variant="danger">Delete test</Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </Cluster>
          }
        >
          <p>
            Responses remain available. This deliberately longer confirmation copy verifies that
            destructive dialog content reflows without pushing the close or recovery actions out of
            reach.
          </p>
        </Dialog>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open confirmation" });
    await userEvent.click(trigger);
    const dialog = within(document.body).getByRole("dialog", { name: "Delete this test?" });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getAllByRole("button")).toHaveLength(3);
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveFocus();
  },
};

// @test4test-coverage drawer | sizes: responsive | variants: right-edge | states: closed, open, focus-contained, long-content
export const DrawerContract: Story = {
  render: function DrawerContractStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open test settings</Button>
        <Drawer open={open} onOpenChange={setOpen} title="Test settings">
          <Stack>
            <p>
              Manage notification and access settings for a deliberately long workspace name while
              preserving a contained focus order.
            </p>
            <Button variant="secondary">Manage notifications</Button>
          </Stack>
        </Drawer>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open test settings" });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByRole("dialog", { name: "Test settings" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveFocus();
  },
};

// @test4test-coverage popover | sizes: content-defined | variants: anchored-dialog | states: closed, open, focus-visible, long-content
export const PopoverContract: Story = {
  render: () => (
    <Popover
      label="Share options"
      trigger={<Button variant="secondary">Open share options</Button>}
    >
      <p>
        Anyone with the link can open the test. This longer anchored message remains readable near
        the viewport edge.
      </p>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open share options" });
    await userEvent.click(trigger);
    await expect(canvas.getByRole("dialog", { name: "Share options" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveFocus();
    await expect(canvas.queryByRole("dialog", { name: "Share options" })).not.toBeInTheDocument();
  },
};

// @test4test-coverage tooltip | sizes: content-defined | variants: supplemental-text | states: hidden, hover, focus, dismissed
export const TooltipContract: Story = {
  render: () => (
    <Tooltip content="Copies the public test link">
      <Button variant="quiet">Copy link</Button>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Copy link" });
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByRole("tooltip")).toHaveTextContent("Copies the public test link");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.hover(trigger);
    await expect(canvas.getByRole("tooltip")).toBeVisible();
  },
};

export const DialogOpenState: Story = {
  render: () => (
    <Dialog
      open
      onOpenChange={() => undefined}
      title="Delete this test?"
      description="This removes the public test link. Responses remain available."
      footer={
        <Cluster>
          <Button variant="danger">Delete test</Button>
          <Button variant="secondary">Cancel</Button>
        </Cluster>
      }
    >
      <p>Checkout usability test</p>
    </Dialog>
  ),
};

export const DrawerOpenState: Story = {
  render: () => (
    <Drawer open onOpenChange={() => undefined} title="Test settings">
      <Stack>
        <p>Manage notification and access settings.</p>
        <Button variant="secondary">Save settings</Button>
      </Stack>
    </Drawer>
  ),
};

export const PopoverOpenState: Story = {
  render: () => (
    <Popover defaultOpen label="Share options" trigger={<Button variant="secondary">Share</Button>}>
      <p>Anyone with the link can open the test.</p>
    </Popover>
  ),
};

export const TooltipOpenState: Story = {
  render: () => (
    <Tooltip defaultOpen content="Copies the public test link">
      <Button variant="quiet">Copy link</Button>
    </Tooltip>
  ),
};
