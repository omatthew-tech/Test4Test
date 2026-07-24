import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  Breadcrumb,
  Button,
  Menu,
  MobileNavigationDrawer,
  Pagination,
  Stack,
  Tabs,
  TopNavigation,
} from "@test4test/design-system";

const meta = {
  title: "Components/Navigation",
  component: TopNavigation,
  args: {
    items: [],
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TopNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NavigationPatterns: Story = {
  render: function NavigationPatternsStory() {
    const [page, setPage] = useState(2);
    return (
      <Stack gap="xl">
        <TopNavigation
          items={[
            { label: "Earn", to: "/earn" },
            { label: "My tests", to: "/my-tests" },
          ]}
          actions={<Button size="compact">Submit a test</Button>}
        />
        <Stack gap="lg">
          <Breadcrumb
            items={[
              { label: "My tests", to: "/my-tests" },
              { label: "Checkout study", to: "/my-tests/1" },
            ]}
          />
          <Tabs
            items={[
              { id: "summary", label: "Summary", panel: <p>Summary content</p> },
              { id: "responses", label: "Responses", panel: <p>Responses content</p> },
            ]}
          />
          <Pagination page={page} pageCount={4} onPageChange={setPage} />
          <Menu
            label="Test actions"
            items={[
              { id: "edit", label: "Edit test", onSelect: () => undefined },
              { id: "share", label: "Share test", onSelect: () => undefined },
            ]}
          />
        </Stack>
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Responses" }));
    await expect(canvas.getByRole("tab", { name: "Responses" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(canvas.getByRole("tabpanel", { name: "Responses" })).toHaveTextContent(
      "Responses content",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Page 4" }));
    await expect(canvas.getByRole("button", { name: "Page 4" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const edit = canvas.getByRole("menuitem", { name: "Edit test" });
    edit.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("menuitem", { name: "Share test" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("tab", { name: "Summary" }));
    await userEvent.click(canvas.getByRole("button", { name: "Page 2" }));
    (canvasElement.ownerDocument.activeElement as HTMLElement | null)?.blur();
  },
};

// @test4test-coverage top-navigation | sizes: responsive | variants: public, authenticated | states: default, current-route, mobile
export const TopNavigationContract: Story = {
  parameters: {
    layout: "fullscreen",
    test4test: { initialEntries: ["/my-tests"] },
  },
  render: () => (
    <TopNavigation
      items={[
        { label: "Earn", to: "/earn" },
        { label: "My tests", to: "/my-tests" },
      ]}
      actions={<Button size="compact">Submit a test</Button>}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Test4Test home" })).toHaveAttribute("href", "/");
    await expect(canvas.getByRole("link", { name: "My tests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

export const TopNavigationPublicState: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <TopNavigation
      items={[
        { label: "How it works", to: "/how-it-works" },
        { label: "Blog", to: "/blog" },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Submit a test" })).not.toBeInTheDocument();
  },
};

// @test4test-coverage mobile-navigation-drawer | sizes: mobile | variants: primary-navigation | states: closed, open, focus-contained
export const MobileNavigationDrawerContract: Story = {
  render: function MobileNavigationDrawerContractStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open contract navigation</Button>
        <MobileNavigationDrawer
          open={open}
          onOpenChange={setOpen}
          title="Contract navigation"
          items={[
            { label: "Earn", to: "/earn" },
            { label: "My tests", to: "/my-tests" },
          ]}
        />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open contract navigation" });
    await userEvent.click(trigger);
    const dialog = within(document.body).getByRole("dialog", { name: "Contract navigation" });
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveFocus();
  },
};

// @test4test-coverage tabs | sizes: responsive | variants: automatic-activation | states: selected, unselected, focus-visible, long-label, overflow
export const TabsContract: Story = {
  render: () => (
    <Tabs
      items={[
        { id: "overview-contract", label: "Overview", panel: <p>Overview panel</p> },
        { id: "responses-contract", label: "Responses", panel: <p>Responses panel</p> },
        {
          id: "recordings-contract",
          label: "Recording permissions and upload recovery",
          panel: <p>Recording recovery panel</p>,
        },
        { id: "sharing-contract", label: "Sharing", panel: <p>Sharing panel</p> },
        { id: "history-contract", label: "History", panel: <p>History panel</p> },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole("tab", { name: "Overview" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Responses" })).toHaveFocus();
    await expect(canvas.getByRole("tabpanel", { name: "Responses" })).toBeVisible();
  },
};

// @test4test-coverage breadcrumb | sizes: responsive | variants: hierarchical | states: default, current-page, long-content, overflow
export const BreadcrumbContract: Story = {
  render: () => (
    <Breadcrumb
      items={[
        { label: "Founder workspace", to: "/workspace" },
        { label: "My tests", to: "/my-tests" },
        { label: "A deliberately long checkout usability test name", to: "/my-tests/checkout" },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(canvas.getByText(/deliberately long checkout/)).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

// @test4test-coverage pagination | sizes: default | variants: button | states: current, available, focus-visible, many-pages
export const PaginationContract: Story = {
  render: function PaginationContractStory() {
    const [page, setPage] = useState(1);
    return <Pagination page={page} pageCount={12} onPageChange={setPage} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const availablePage = canvas.getByRole("button", { name: "Page 12" });
    availablePage.focus();
    await expect(availablePage).toHaveFocus();
    await userEvent.click(availablePage);
    await expect(canvas.getByRole("button", { name: "Page 12" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

// @test4test-coverage menu | sizes: default | variants: action-menu | states: enabled, disabled, focus-visible, long-content
export const MenuContract: Story = {
  render: function MenuContractStory() {
    const [dismissed, setDismissed] = useState(false);
    return (
      <Stack>
        <Menu
          label="Response actions"
          onEscape={() => setDismissed(true)}
          items={[
            {
              id: "review",
              label: "Review response with a deliberately long action label",
              onSelect: () => undefined,
            },
            {
              id: "disabled",
              label: "Unavailable action",
              onSelect: () => undefined,
              disabled: true,
            },
          ]}
        />
        <output>{dismissed ? "Menu dismissed" : "Menu open"}</output>
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const item = canvas.getByRole("menuitem", {
      name: "Review response with a deliberately long action label",
    });
    item.focus();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByText("Menu dismissed")).toBeVisible();
    await expect(canvas.getByRole("menuitem", { name: "Unavailable action" })).toBeDisabled();
  },
};

export const MobileNavigationDrawerOpenState: Story = {
  render: () => (
    <MobileNavigationDrawer
      open
      onOpenChange={() => undefined}
      title="Navigation"
      items={[
        { label: "Earn", to: "/earn" },
        { label: "My tests", to: "/my-tests" },
        { label: "Submit a test", to: "/submit" },
      ]}
    />
  ),
};
