# Forms

Group related fields with a visible legend or heading. Keep labels persistent, associate help and error text with the field, and focus the error summary after an invalid submit. Primary submit actions remain visually distinct from secondary or destructive actions. Preserve entered values when submission fails.

Use `TextField`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Radio`, and `Switch` for controls,
with `HelpText`, `InlineValidation`, and `FormSummary` for supporting content. Controlled and
uncontrolled behavior must follow each component contract.

On submit:

1. Validate without clearing any entered value.
2. Add `aria-invalid` and `aria-describedby` to each invalid control.
3. Render a `FormSummary` whose links move focus to the corresponding field.
4. Announce asynchronous failure or success through the appropriate live region.
5. Keep a destructive action visually and structurally separate from the primary submit action.

Multi-step editors use `Stepper` for orientation. Moving between steps must preserve the draft,
return keyboard focus to the new step heading or first invalid field, and never use color alone to
communicate completion.
