import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  Alert,
  Button,
  Card,
  Cluster,
  PageHeader,
  QuestionEditor,
  RatingControl,
  RecordingStatus,
  ResponseViewer,
  Stack,
  StatusIndicator,
  Stepper,
  TestRow,
} from "@test4test/design-system";

const meta = {
  title: "Patterns/Product",
  component: PageHeader,
  args: {
    title: "Page title",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkflowStates: Story = {
  render: function WorkflowStatesStory() {
    const [rating, setRating] = useState(3);
    return (
      <Stack gap="xl">
        <PageHeader
          title="My tests"
          description="Review active tests and the feedback testers submitted."
          actions={<Button>Submit a test</Button>}
        />
        <Stepper
          currentStep="questions"
          steps={[
            { id: "details", label: "Test details" },
            { id: "questions", label: "Questions" },
            { id: "review", label: "Review" },
          ]}
        />
        <TestRow
          title="Checkout usability test"
          metadata="4 responses · Updated July 22"
          status="Collecting responses"
          statusTone="success"
          actions={<Button variant="secondary">View test</Button>}
        />
        <RatingControl
          legend="How easy was this task?"
          name="ease"
          value={rating}
          onChange={setRating}
        />
        <RecordingStatus
          status="Uploading recording"
          description="Keep this page open. Your recording is safe while the upload completes."
          progress={64}
        />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "My tests" })).toBeVisible();
    const highestRating = canvas.getByRole("radio", { name: "5" });
    await userEvent.click(highestRating);
    await expect(highestRating).toBeChecked();
    await expect(canvas.getByRole("progressbar", { name: "Recording upload" })).toHaveValue(64);
    await userEvent.click(canvas.getByRole("radio", { name: "3" }));
    (canvasElement.ownerDocument.activeElement as HTMLElement | null)?.blur();
  },
};

export const MyTestsDataPresentation: Story = {
  render: () => (
    <Stack gap="xl">
      <PageHeader
        eyebrow={<StatusIndicator tone="info">Founder workspace</StatusIndicator>}
        title="My tests"
        description="Manage active tests, share tester links, and review incoming responses."
        actions={<Button>Submit a test</Button>}
      />
      <Stack gap="md">
        <TestRow
          title="Palette Pilot"
          metadata="Website · 8 responses · Updated today"
          status="Collecting responses"
          statusTone="success"
          actions={
            <Cluster>
              <Button variant="secondary">Share</Button>
              <Button variant="secondary">View responses</Button>
            </Cluster>
          }
        />
        <TestRow
          title="Checkout usability"
          metadata="Android · 12 responses · Updated July 21"
          status="Closed"
          actions={<Button variant="secondary">View responses</Button>}
        />
      </Stack>
    </Stack>
  ),
};

export const RecordingFlow: Story = {
  render: () => (
    <Stack gap="xl">
      <PageHeader
        eyebrow={<StatusIndicator tone="info">Test session</StatusIndicator>}
        title="Record your test"
        description="Complete the task in Palette Pilot while Test4Test records your screen and microphone."
      />
      <Card>
        <Stack gap="lg">
          <Stack gap="sm">
            <h2>Before you start</h2>
            <p>
              Close sensitive windows, keep this tab open, and allow screen and microphone access
              when prompted.
            </p>
          </Stack>
          <Alert tone="info" title="Your privacy matters">
            Pause before entering passwords or personal information. The founder receives only this
            test recording.
          </Alert>
          <RecordingStatus
            status="Ready to record"
            description="Your recording has not started. You can review permissions first."
          />
          <Cluster>
            <Button>Start recording</Button>
            <Button variant="secondary">Review questions</Button>
          </Cluster>
        </Stack>
      </Card>
      <Card>
        <Stack gap="lg">
          <RecordingStatus
            status="Uploading recording"
            description="Keep this page open. Your recording is safe while the upload completes."
            progress={64}
          />
          <Button disabled>Submit test</Button>
        </Stack>
      </Card>
    </Stack>
  ),
};

// @test4test-coverage page-header | sizes: responsive | variants: with-actions, without-actions, centered | states: default, long-content, narrow-width
export const PageHeaderContract: Story = {
  render: () => (
    <PageHeader
      title="Submission details"
      description="Review responses and manage the public testing link for a deliberately long workspace name without losing access to the primary action at narrow widths."
      actions={<Button>Share test</Button>}
      alignment="center"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Submission details" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Share test" })).toBeEnabled();
  },
};

// @test4test-coverage stepper | sizes: responsive | variants: labeled, numbers-only | states: upcoming, current, complete, long-label
export const StepperContract: Story = {
  render: () => (
    <Stack gap="xl">
      <Stepper
        currentStep="questions"
        steps={[
          { id: "details", label: "Test details" },
          { id: "questions", label: "Questions with a deliberately long label" },
          { id: "review", label: "Review" },
        ]}
      />
      <Stepper
        currentStep="questions"
        variant="numbers-only"
        steps={[
          { id: "details", label: "Test details" },
          { id: "questions", label: "Questions with a deliberately long label" },
          { id: "review", label: "Review" },
        ]}
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const progressLists = within(canvasElement).getAllByRole("list", { name: "Progress" });
    const labeledCurrentStep = within(progressLists[0])
      .getByText("Questions with a deliberately long label")
      .closest("li");
    const numbersOnlyLabel = within(progressLists[1]).getByText(
      "Questions with a deliberately long label",
    );

    await expect(labeledCurrentStep).toHaveAttribute("aria-current", "step");
    await expect(numbersOnlyLabel).toHaveClass("ds-sr-only");
    await expect(numbersOnlyLabel.closest("li")).toHaveAttribute("aria-current", "step");
  },
};

// @test4test-coverage rating-control | sizes: default | variants: numeric-range | states: unselected, selected, focus-visible, disabled
export const RatingControlContract: Story = {
  render: function RatingControlContractStory() {
    const [rating, setRating] = useState<number>();
    return (
      <Stack>
        <RatingControl
          legend="How easy was this task?"
          name="contract-rating"
          value={rating}
          onChange={setRating}
        />
        <RatingControl
          disabled
          legend="Unavailable rating"
          name="disabled-contract-rating"
          value={3}
          onChange={() => undefined}
        />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const option = canvas.getAllByRole("radio", { name: "5" })[0];
    option.focus();
    await expect(option).toHaveFocus();
    await userEvent.click(option);
    await expect(option).toBeChecked();
    await expect(canvas.getAllByRole("radio", { name: "3" })[1]).toBeDisabled();
  },
};

// @test4test-coverage recording-status | sizes: responsive | variants: permission, recording, upload, complete, error | states: permission, capturing, uploading, retry, complete
export const RecordingStatusContract: Story = {
  render: () => (
    <Stack>
      <RecordingStatus
        status="Microphone permission needed"
        description="Allow microphone access, then retry."
      />
      <RecordingStatus
        status="Recording in progress"
        description="Speak your thoughts aloud while completing the task."
      />
      <RecordingStatus
        status="Uploading recording"
        description="Keep this page open while the upload completes."
        progress={64}
      />
      <RecordingStatus
        status="Upload complete"
        description="The recording is ready to submit."
        progress={100}
      />
      <RecordingStatus
        status="Upload failed"
        description="Your recording is safe. Retry when the connection returns."
        tone="danger"
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("progressbar")).toHaveLength(2);
    await expect(canvas.getByText("Microphone permission needed")).toBeVisible();
    await expect(canvas.getByText("Recording in progress")).toBeVisible();
    await expect(canvas.getByText("Upload failed")).toBeVisible();
  },
};

// @test4test-coverage test-row | sizes: responsive | variants: with-actions, without-actions | states: loading, active, closed, error, long-content, narrow-width
export const TestRowContract: Story = {
  render: () => (
    <Stack>
      <TestRow
        title="A deliberately long checkout usability test name that wraps safely"
        metadata="Website · 8 responses · Updated today"
        status="Collecting responses"
        statusTone="success"
        actions={<Button variant="secondary">View responses</Button>}
      />
      <TestRow title="Preparing prototype study" status="Loading test details" statusTone="info" />
      <TestRow title="Closed pricing study" status="Closed" />
      <TestRow
        title="Mobile onboarding study"
        status="Response sync failed"
        statusTone="danger"
        actions={<Button variant="secondary">Retry</Button>}
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("article")).toHaveLength(4);
    await expect(canvas.getByRole("button", { name: "View responses" })).toBeEnabled();
    await expect(canvas.getByText("Loading test details")).toBeVisible();
    await expect(canvas.getByText("Closed")).toBeVisible();
    await expect(canvas.getByText("Response sync failed")).toBeVisible();
  },
};

// @test4test-coverage question-editor | sizes: responsive | variants: with-actions, without-actions | states: empty, filled, disabled, help, error, long-content
export const QuestionEditorContract: Story = {
  render: function QuestionEditorContractStory() {
    const [question, setQuestion] = useState("");
    return (
      <Stack>
        <QuestionEditor
          id="contract-question"
          label="Question 1"
          value={question}
          onChange={setQuestion}
          error={question ? undefined : "Add a question before continuing."}
          actions={<Button variant="danger">Remove question</Button>}
        />
        <QuestionEditor
          id="contract-question-help"
          label="Question with guidance"
          value="What did you expect to happen after checkout?"
          onChange={() => undefined}
          helpText="Ask about one observable outcome at a time."
        />
        <QuestionEditor
          id="contract-question-disabled"
          disabled
          label="Disabled question"
          value="This question is locked while responses are collected."
          onChange={() => undefined}
        />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole("textbox", { name: "Question 1" });
    await userEvent.type(editor, "What made checkout difficult?");
    await expect(editor).toHaveValue("What made checkout difficult?");
    await expect(canvas.getByRole("button", { name: "Remove question" })).toBeEnabled();
    await expect(canvas.getByRole("textbox", { name: "Disabled question" })).toBeDisabled();
  },
};

// @test4test-coverage response-viewer | sizes: responsive | variants: with-actions, without-actions | states: empty, populated, reported, long-content, narrow-width
export const ResponseViewerContract: Story = {
  render: () => (
    <Stack>
      <ResponseViewer
        question="What made checkout difficult?"
        metadata="Anonymous tester · July 22, 2026"
        response="The confirmation message did not make it clear whether the order had been placed. This intentionally longer response verifies wrapping and readable measure."
        actions={<Button variant="secondary">Report response</Button>}
      />
      <ResponseViewer
        question="What did you expect to happen?"
        metadata="Reported response · July 21, 2026"
        response="This response was reported and remains available to the workspace owner while it is reviewed."
      />
      <ResponseViewer
        question="Optional final comments"
        metadata="Anonymous tester · July 20, 2026"
        response="No response provided."
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("article")).toHaveLength(3);
    await expect(
      canvas.getByRole("heading", { name: "What made checkout difficult?" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Report response" })).toBeEnabled();
    await expect(canvas.getByText(/This response was reported/)).toBeVisible();
    await expect(canvas.getByText("No response provided.")).toBeVisible();
  },
};
