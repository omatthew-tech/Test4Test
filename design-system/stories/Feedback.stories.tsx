import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  Alert,
  Button,
  EmptyState,
  FormSummary,
  InlineValidation,
  Progress,
  Skeleton,
  Stack,
  Toast,
} from "@test4test/design-system";

const meta = {
  title: "Components/Feedback",
  component: Alert,
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <Stack gap="lg">
      <Alert title="Recording permission needed">Allow microphone access, then retry.</Alert>
      <Alert tone="success" title="Test saved">
        Your changes are available to testers.
      </Alert>
      <Alert tone="warning" title="Upload paused">
        Your recording is safe on this device.
      </Alert>
      <Alert tone="danger" title="Upload failed">
        Check your connection and retry the upload.
      </Alert>
      <Progress label="Uploading recording" value={64} />
      <Skeleton aria-label="Loading test summary" />
      <EmptyState
        title="No responses yet"
        description="Responses will appear here after a tester completes this test."
        action={<Button variant="secondary">Copy share link</Button>}
      />
      <Toast open title="Changes saved">
        The test details are up to date.
      </Toast>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Upload failed");
    await expect(canvas.getByRole("progressbar", { name: "Uploading recording" })).toHaveValue(64);
    await expect(canvas.getByRole("heading", { name: "No responses yet" })).toBeVisible();
    await expect(canvas.getByText("Changes saved")).toBeVisible();
  },
};

// @test4test-coverage alert | sizes: responsive | variants: info, success, warning, danger | states: routine, urgent, long-content
export const AlertContract: Story = {
  render: () => (
    <Stack>
      <Alert tone="info" title="Recording permission">
        Allow microphone access to continue.
      </Alert>
      <Alert tone="success" title="Test saved">
        Your changes are available to testers.
      </Alert>
      <Alert tone="warning" title="Upload paused">
        Your recording is safe on this device while the connection recovers.
      </Alert>
      <Alert tone="danger" title="Upload failed">
        Your recording remains safe. Retry when the connection returns. This deliberately longer
        urgent message verifies that alert content wraps without separating the icon, title, and
        recovery guidance.
      </Alert>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("status")[0]).toHaveTextContent("Recording permission");
    await expect(canvas.getByRole("alert")).toHaveTextContent("Your recording remains safe");
  },
};

// @test4test-coverage toast | sizes: responsive | variants: info, success, warning, danger | states: closed, open, long-content
export const ToastContract: Story = {
  render: () => (
    <>
      <Toast open tone="success" title="Changes saved">
        The test details are up to date, and this longer confirmation remains readable on a narrow
        viewport.
      </Toast>
      <Toast open={false} tone="info" title="Hidden notification">
        Closed toasts are absent from the accessibility tree.
      </Toast>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Changes saved");
    await expect(canvas.queryByText("Hidden notification")).not.toBeInTheDocument();
  },
};

export const ToastInfoState: Story = {
  render: () => (
    <Toast open tone="info" title="Recording prepared">
      You can begin when you are ready.
    </Toast>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Recording prepared");
  },
};

export const ToastWarningState: Story = {
  render: () => (
    <Toast open tone="warning" title="Connection unstable">
      Keep this page open while Test4Test reconnects.
    </Toast>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "Connection unstable",
    );
  },
};

export const ToastDangerState: Story = {
  render: () => (
    <Toast open tone="danger" title="Upload failed">
      Retry the upload when your connection returns.
    </Toast>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Upload failed");
  },
};

// @test4test-coverage inline-validation | sizes: default | variants: error | states: present, long-content
export const InlineValidationContract: Story = {
  render: () => (
    <div>
      <label htmlFor="contract-invalid-field">Website URL</label>
      <input
        id="contract-invalid-field"
        aria-invalid="true"
        aria-describedby="contract-inline-error"
      />
      <InlineValidation id="contract-inline-error">
        Enter a complete URL beginning with https://. The address must be publicly reachable by the
        tester without requiring private workspace credentials.
      </InlineValidation>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Website URL" });
    await expect(field).toHaveAccessibleDescription(/Enter a complete URL beginning with https/);
  },
};

// @test4test-coverage form-summary | sizes: responsive | variants: error | states: empty, errors, focused, long-content
export const FormSummaryContract: Story = {
  render: () => (
    <Stack>
      <section aria-label="Empty form summary">
        <FormSummary items={[]} />
      </section>
      <section aria-label="Form summary with errors">
        <FormSummary
          items={[
            { fieldId: "contract-name", message: "Add a test name." },
            {
              fieldId: "contract-url",
              message:
                "Enter a complete website URL that testers can open without private credentials.",
            },
          ]}
        />
      </section>
      <label htmlFor="contract-name">Test name</label>
      <input id="contract-name" />
      <label htmlFor="contract-url">Website URL</label>
      <input id="contract-url" />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole("alert");
    summary.focus();
    await expect(summary).toHaveFocus();
    await userEvent.click(canvas.getByRole("link", { name: "Add a test name." }));
    await expect(canvas.getByRole("textbox", { name: "Test name" })).toHaveFocus();
  },
};

// @test4test-coverage progress | sizes: responsive | variants: determinate, indeterminate | states: in-progress, complete
export const ProgressContract: Story = {
  render: () => (
    <Stack>
      <Progress label="Uploading recording" value={64} />
      <Progress label="Preparing test" />
      <Progress label="Upload complete" value={100} />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("progressbar", { name: "Uploading recording" })).toHaveValue(64);
    await expect(canvas.getByRole("progressbar", { name: "Preparing test" })).not.toHaveAttribute(
      "value",
    );
    await expect(canvas.getByRole("progressbar", { name: "Upload complete" })).toHaveValue(100);
  },
};

// @test4test-coverage skeleton | sizes: content-defined | variants: block | states: loading, reduced-motion
export const SkeletonContract: Story = {
  render: () => (
    <div aria-busy="true" role="status">
      <span className="ds-sr-only">Loading test summary</span>
      <Skeleton label="Test summary placeholder" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveAttribute("aria-busy", "true");
    await expect(canvas.getByText("Loading test summary")).toBeVisible();
  },
};

// @test4test-coverage empty-state | sizes: responsive | variants: with-action, without-action | states: empty, permission, offline
export const EmptyStateContract: Story = {
  render: () => (
    <Stack gap="xl">
      <EmptyState
        title="No responses yet"
        description="Responses will appear after a tester completes this test."
        action={<Button variant="secondary">Copy share link</Button>}
      />
      <EmptyState
        title="Permission required"
        description="Allow microphone access before beginning the recorded session."
      />
      <EmptyState
        title="You are offline"
        description="Reconnect to load this test. Your current work remains on this device."
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "No responses yet" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Permission required" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Copy share link" })).toBeEnabled();
  },
};
