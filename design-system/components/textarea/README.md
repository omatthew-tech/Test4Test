# Textarea

Labeled multiline input with help, validation, and optional count.

- Family: inputs
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Textarea`
- Source: `design-system/components/inputs.tsx`
- Story: `design-system/stories/Inputs.stories.tsx#TextareaContract`
- Control mode: both

## Public API

- Sizes: `default`
- Variants: `resizable`
- States: `empty`, `filled`, `focus-visible`, `disabled`, `required`, `help`, `error`
- Accessible name: Required persistent label prop.

## Accessibility contract

- Persistent label
- Help and error descriptions
- aria-invalid on error

## Keyboard

- Native multiline editing

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Inputs.stories.tsx#TextareaContract`
