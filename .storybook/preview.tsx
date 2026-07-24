import type { Preview } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import "@test4test/design-system";

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={context.parameters.test4test?.initialEntries ?? ["/"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    a11y: {
      test: "error",
    },
    controls: {
      expanded: true,
    },
    layout: "padded",
    options: {
      storySort: {
        order: ["Foundations", "Components", "Patterns"],
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;
