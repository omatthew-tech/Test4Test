import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  Checkbox,
  Combobox,
  HelpText,
  Radio,
  Select,
  Stack,
  Switch,
  Textarea,
  TextField,
} from "@test4test/design-system";

const meta = {
  title: "Components/Inputs",
  component: TextField,
  args: {
    label: "Example field",
  },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: function InputsStates() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Stack gap="lg">
        <TextField
          label="Test name"
          placeholder="Checkout usability test"
          helpText="Use a name testers will recognize."
        />
        <TextField
          label="Website URL"
          defaultValue="https://example.com"
          error="Enter a complete URL beginning with https://."
        />
        <Textarea label="Instructions" defaultValue="Complete checkout without placing an order." />
        <Select label="Test type" defaultValue="website">
          <option value="website">Website</option>
          <option value="prototype">Prototype</option>
        </Select>
        <Combobox
          label="Country"
          options={[
            { value: "United States", label: "United States" },
            { value: "Canada", label: "Canada" },
          ]}
        />
        <Checkbox label="Allow testers to request clarification" defaultChecked />
        <Radio label="Five-minute test" name="length" defaultChecked />
        <Radio label="Ten-minute test" name="length" />
        <Switch
          label="Email notifications"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Test name" });
    await userEvent.type(name, "Prototype review");
    await expect(name).toHaveValue("Prototype review");
    await expect(canvas.getByRole("textbox", { name: "Website URL" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    const notifications = canvas.getByRole("switch", { name: "Email notifications" });
    await expect(notifications).toBeChecked();
    await userEvent.click(notifications);
    await expect(notifications).not.toBeChecked();
  },
};

// @test4test-coverage text-field | sizes: default | variants: text, email, url, password, search | states: empty, filled, focus-visible, disabled, required, help, error
export const TextFieldContract: Story = {
  render: () => (
    <Stack>
      <TextField label="Test name" helpText="Use a recognizable name." type="text" />
      <TextField
        label="Notification email"
        type="email"
        required
        value="founder@example.com"
        readOnly
      />
      <TextField
        label="Website URL"
        error="Enter a complete URL."
        type="url"
        value="example"
        readOnly
      />
      <TextField
        label="Private access code"
        disabled
        type="password"
        value="Unavailable"
        readOnly
      />
      <TextField label="Search responses" placeholder="Search by keyword" type="search" />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Test name" });
    await userEvent.type(field, "Checkout review");
    await expect(field).toHaveValue("Checkout review");
    field.focus();
    await expect(field).toHaveFocus();
    await expect(canvas.getByLabelText(/Notification email/)).toBeRequired();
    await expect(canvas.getByLabelText(/Private access code/)).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "Website URL" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

// @test4test-coverage textarea | sizes: default | variants: resizable | states: empty, filled, focus-visible, disabled, required, help, error
export const TextareaContract: Story = {
  render: () => (
    <Stack>
      <Textarea
        label="Test instructions"
        helpText="Explain the outcome without narrating interface mechanics."
        required
      />
      <Textarea
        label="Existing instructions"
        defaultValue="Complete checkout without placing an order."
      />
      <Textarea
        label="Instructions with error"
        error="Add enough detail for a tester to begin."
        value=""
        readOnly
      />
      <Textarea label="Disabled instructions" disabled value="Editing is unavailable." readOnly />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Test instructions" });
    await userEvent.type(field, "Complete checkout without placing an order.");
    await expect(field).toHaveValue("Complete checkout without placing an order.");
    field.focus();
    await expect(field).toHaveFocus();
    await expect(canvas.getByRole("textbox", { name: "Instructions with error" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(canvas.getByRole("textbox", { name: "Disabled instructions" })).toBeDisabled();
  },
};

// @test4test-coverage select | sizes: default | variants: single | states: empty, selected, focus-visible, disabled, required, help, error
export const SelectContract: Story = {
  render: () => (
    <Stack>
      <Select label="Test type" defaultValue="">
        <option value="">Choose a test type</option>
        <option value="website">Website</option>
        <option value="prototype">Prototype</option>
      </Select>
      <Select
        label="Required platform"
        defaultValue="website"
        helpText="Choose the platform testers will use."
        required
      >
        <option value="website">Website</option>
        <option value="prototype">Prototype</option>
      </Select>
      <Select label="Invalid platform" error="Choose an available platform." defaultValue="">
        <option value="">Unavailable</option>
      </Select>
      <Select label="Disabled platform" disabled defaultValue="website">
        <option value="website">Website</option>
      </Select>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("combobox", { name: "Test type" });
    await userEvent.selectOptions(select, "prototype");
    await expect(select).toHaveValue("prototype");
    select.focus();
    await expect(select).toHaveFocus();
    await expect(canvas.getByRole("combobox", { name: "Required platform" })).toBeRequired();
    await expect(canvas.getByRole("combobox", { name: "Invalid platform" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(canvas.getByRole("combobox", { name: "Disabled platform" })).toBeDisabled();
  },
};

// @test4test-coverage combobox | sizes: default | variants: datalist | states: empty, filled, expanded, disabled, help, error
export const ComboboxContract: Story = {
  render: () => (
    <Stack>
      <Combobox
        label="Country"
        helpText="Begin typing to view matching countries."
        options={[
          { value: "United States", label: "United States" },
          { value: "Canada", label: "Canada" },
        ]}
      />
      <Combobox
        label="Selected country"
        value="Canada"
        readOnly
        options={[
          { value: "United States", label: "United States" },
          { value: "Canada", label: "Canada" },
        ]}
      />
      <Combobox
        label="Country with error"
        error="Choose a supported country."
        value="Atlantis"
        readOnly
        options={[{ value: "Canada", label: "Canada" }]}
      />
      <Combobox
        label="Disabled country"
        disabled
        options={[{ value: "Canada", label: "Canada" }]}
      />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Country" });
    await userEvent.type(input, "Canada");
    await expect(input).toHaveValue("Canada");
    await expect(input).toHaveAttribute("list");
    await expect(canvas.getByRole("combobox", { name: "Country with error" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(canvas.getByRole("combobox", { name: "Disabled country" })).toBeDisabled();
  },
};

// @test4test-coverage checkbox | sizes: default | variants: with-description, without-description | states: unchecked, checked, indeterminate, focus-visible, disabled
export const CheckboxContract: Story = {
  render: function CheckboxContractStory() {
    const indeterminate = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (indeterminate.current) indeterminate.current.indeterminate = true;
    }, []);
    return (
      <Stack>
        <Checkbox label="Unchecked option" />
        <Checkbox
          label="Allow clarification requests"
          description="Testers can ask one question before starting."
          defaultChecked
        />
        <Checkbox ref={indeterminate} label="Partially selected responses" />
        <Checkbox disabled label="Disabled option" />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "Unchecked option" });
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    checkbox.focus();
    await expect(checkbox).toHaveFocus();
    await expect(
      canvas.getByRole("checkbox", { name: "Partially selected responses" }),
    ).toBePartiallyChecked();
    await expect(canvas.getByRole("checkbox", { name: "Disabled option" })).toBeDisabled();
  },
};

// @test4test-coverage radio | sizes: default | variants: with-description, without-description | states: unchecked, checked, focus-visible, disabled
export const RadioContract: Story = {
  render: () => (
    <fieldset>
      <legend>Test length</legend>
      <Radio
        label="Five minutes"
        description="Best for one focused task."
        name="contract-length"
        value="5"
      />
      <Radio label="Ten minutes" name="contract-length" value="10" defaultChecked />
      <Radio disabled label="Unavailable length" name="contract-length" value="disabled" />
    </fieldset>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const option = canvas.getByRole("radio", { name: "Five minutes" });
    await userEvent.click(option);
    await expect(option).toBeChecked();
    option.focus();
    await expect(option).toHaveFocus();
    await expect(canvas.getByRole("radio", { name: "Unavailable length" })).toBeDisabled();
  },
};

// @test4test-coverage switch | sizes: default | variants: with-description, without-description | states: off, on, focus-visible, disabled
export const SwitchContract: Story = {
  render: function SwitchContractStory() {
    const [enabled, setEnabled] = useState(false);
    return (
      <Stack>
        <Switch
          label="Email notifications"
          description="Receive a message when a response arrives."
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <Switch label="Enabled by default" defaultChecked />
        <Switch disabled label="Disabled notifications" />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole("switch", { name: "Email notifications" });
    await userEvent.click(control);
    await expect(control).toBeChecked();
    control.focus();
    await expect(control).toHaveFocus();
    await expect(canvas.getByRole("switch", { name: "Enabled by default" })).toBeChecked();
    await expect(canvas.getByRole("switch", { name: "Disabled notifications" })).toBeDisabled();
  },
};

// @test4test-coverage help-text | sizes: default | variants: field-guidance | states: default, long-content
export const HelpTextContract: Story = {
  render: () => (
    <div>
      <label htmlFor="test-id-contract">Test identifier</label>
      <input id="test-id-contract" aria-describedby="test-id-help" />
      <HelpText id="test-id-help">
        Use the identifier from the invitation. This intentionally longer guidance verifies that
        supporting text wraps without overlapping the owning field or adjacent content.
      </HelpText>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "Test identifier" }),
    ).toHaveAccessibleDescription(/Use the identifier from the invitation/);
  },
};
