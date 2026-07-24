# Switch

Immediate on or off setting with explicit state.

- Family: inputs
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Switch`
- Source: `design-system/components/inputs.tsx`
- Story: `design-system/stories/Inputs.stories.tsx#SwitchContract`
- Control mode: both

## Public API

- Sizes: `default`
- Variants: `with-description`, `without-description`
- States: `off`, `on`, `focus-visible`, `disabled`
- Accessible name: Required visible label prop.

## Accessibility contract

- Native checkbox with switch role
- Visible label

## Keyboard

- Space toggles

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Inputs.stories.tsx#SwitchContract`
