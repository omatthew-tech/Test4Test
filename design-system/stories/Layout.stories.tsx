import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import {
  ApplicationShell,
  BentoGrid,
  Card,
  Cluster,
  Container,
  Divider,
  Grid,
  Section,
  Stack,
} from "@test4test/design-system";

const meta = {
  title: "Components/Layout",
  component: Container,
  args: {
    children: "Container content",
  },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResponsiveComposition: Story = {
  render: () => (
    <Section tone="subtle">
      <Container>
        <Stack gap="xl">
          <Grid>
            <Card>Intrinsic grid item</Card>
            <Card>Longer content wraps without changing the shared rhythm.</Card>
            <Card>Third grid item</Card>
          </Grid>
          <BentoGrid wideItemIndexes={[0]}>
            <Card>Primary summary</Card>
            <Card>Secondary detail</Card>
            <Card>Supporting detail</Card>
          </BentoGrid>
        </Stack>
      </Container>
    </Section>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Primary summary")).toBeVisible();
    await expect(canvas.getAllByText(/grid item|detail|summary/)).toHaveLength(5);
  },
};

// @test4test-coverage container | sizes: full, prose, form, data | variants: semantic-element | states: default, narrow-width, long-content
export const ContainerContract: Story = {
  render: () => (
    <Stack gap="lg">
      <Container aria-label="Full container" size="full">
        <p>Full container uses the application maximum width.</p>
      </Container>
      <Container aria-label="Prose container" as="section" size="prose">
        <p>
          A prose container keeps calm reading measure even when this intentionally long content
          wraps across a narrow viewport.
        </p>
      </Container>
      <Container aria-label="Form container" as="section" size="form">
        <p>Form container keeps multi-step inputs readable.</p>
      </Container>
      <Container aria-label="Data container" as="section" size="data">
        <p>Data container gives tables and response viewers additional room.</p>
      </Container>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/calm reading measure/)).toBeVisible();
    await expect(canvas.getByRole("region", { name: "Form container" })).toBeVisible();
    await expect(canvas.getByRole("region", { name: "Data container" })).toBeVisible();
  },
};

// @test4test-coverage stack | sizes: xs, sm, md, lg, xl | variants: semantic-element | states: default, long-content
export const StackContract: Story = {
  render: () => (
    <Stack as="section" gap="xl" aria-label="Stack examples">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((gap) => (
        <Stack as="article" gap={gap} aria-label={`${gap} stack`} key={gap}>
          <strong>{gap.toUpperCase()} stack gap</strong>
          <span>First item</span>
          <span>
            Second item with deliberately longer content that remains readable and preserves the
            vertical rhythm.
          </span>
        </Stack>
      ))}
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("region", { name: "Stack examples" }),
    ).toBeVisible();
    await expect(within(canvasElement).getAllByRole("article")).toHaveLength(5);
  },
};

// @test4test-coverage cluster | sizes: xs, sm, md, lg, xl | variants: wrapping | states: default, narrow-width, long-content
export const ClusterContract: Story = {
  render: () => (
    <Stack gap="lg">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((gap) => (
        <Cluster gap={gap} aria-label={`${gap} cluster`} key={gap} role="group">
          <button type="button">One action</button>
          <button type="button">Another action with a longer label that wraps safely</button>
          <button type="button">Third action</button>
        </Cluster>
      ))}
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button")).toHaveLength(15);
    await expect(canvas.getByRole("group", { name: "xl cluster" })).toBeVisible();
  },
};

// @test4test-coverage grid | sizes: xs, sm, md, lg, xl | variants: intrinsic | states: default, narrow-width, long-content
export const GridContract: Story = {
  render: () => (
    <Stack gap="lg">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((gap) => (
        <Grid gap={gap} aria-label={`${gap} grid`} key={gap} role="group">
          <Card>Primary content</Card>
          <Card>Secondary content that remains readable at a narrow width.</Card>
        </Grid>
      ))}
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Primary content")).toHaveLength(5);
    await expect(canvas.getByRole("group", { name: "xl grid" })).toBeVisible();
  },
};

// @test4test-coverage divider | sizes: default | variants: semantic, decorative | states: default
export const DividerContract: Story = {
  render: () => (
    <Stack>
      <p>Before separator</p>
      <Divider />
      <p>After separator</p>
      <Divider decorative />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("separator")).toBeVisible();
  },
};

// @test4test-coverage section | sizes: responsive | variants: canvas, subtle | states: default, narrow-width
export const SectionContract: Story = {
  render: () => (
    <Stack>
      <Section tone="canvas" aria-labelledby="canvas-section-title">
        <h2 id="canvas-section-title">Canvas section</h2>
        <p>Default canvas content.</p>
      </Section>
      <Section tone="subtle" aria-labelledby="subtle-section-title">
        <h2 id="subtle-section-title">Subtle section</h2>
        <p>Subtle section content that reflows at narrow widths.</p>
      </Section>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Canvas section" })).toBeVisible();
    await expect(canvas.getByRole("region", { name: "Subtle section" })).toBeVisible();
  },
};

// @test4test-coverage bento-grid | sizes: responsive | variants: standard, wide-item | states: default, narrow-width, long-content
export const BentoGridContract: Story = {
  render: () => (
    <Stack gap="xl">
      <BentoGrid aria-label="Standard bento summary" role="group">
        <Card>Standard primary summary</Card>
        <Card>Standard secondary summary</Card>
      </BentoGrid>
      <BentoGrid wideItemIndexes={[0]} aria-label="Wide item bento summary" role="group">
        <Card>
          Primary summary with deliberately longer content that verifies wrapping and responsive
          collapse without changing document order.
        </Card>
        <Card>Secondary summary</Card>
        <Card>Supporting summary</Card>
      </BentoGrid>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("group", { name: "Standard bento summary" })).toBeVisible();
    await expect(canvas.getByRole("group", { name: "Wide item bento summary" })).toBeVisible();
  },
};

// @test4test-coverage application-shell | sizes: responsive | variants: header-main-footer | states: default, narrow-width, long-content
export const ApplicationShellContract: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <ApplicationShell
      header={<header>Header content</header>}
      footer={<footer>Footer content</footer>}
    >
      <h1>Route title</h1>
      <p>
        Main content includes a deliberately long route description that verifies the shared shell
        remains readable at narrow widths and when text is enlarged.
      </p>
    </ApplicationShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("main")).toHaveAttribute("id", "main-content");
    await expect(canvas.getByRole("heading", { level: 1, name: "Route title" })).toBeVisible();
  },
};
