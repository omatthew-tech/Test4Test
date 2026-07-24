# Text field

Labeled single-line text input with help and validation.

- Family: inputs
- Lifecycle: stable
- Version: 1.0.0
- Public export: `TextField`
- Source: `design-system/components/inputs.tsx`
- Story: `design-system/stories/Inputs.stories.tsx#TextFieldContract`
- Control mode: both

## Public API

- Sizes: `default`
- Variants: `text`, `email`, `url`, `password`, `search`
- States: `empty`, `filled`, `focus-visible`, `disabled`, `required`, `help`, `error`
- Accessible name: Required persistent label prop.

## Accessibility contract

- Persistent label
- Help and error descriptions
- aria-invalid on error

## Keyboard

- Native text editing

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Inputs.stories.tsx#TextFieldContract`
