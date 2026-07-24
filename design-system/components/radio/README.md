# Radio

Single choice within a named group.

- Family: inputs
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Radio`
- Source: `design-system/components/inputs.tsx`
- Story: `design-system/stories/Inputs.stories.tsx#RadioContract`
- Control mode: both

## Public API

- Sizes: `default`
- Variants: `with-description`, `without-description`
- States: `unchecked`, `checked`, `focus-visible`, `disabled`
- Accessible name: Required visible label prop; groups require fieldset and legend.

## Accessibility contract

- Native radio
- Fieldset and legend for groups

## Keyboard

- Arrow keys move within group
- Space selects

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Inputs.stories.tsx#RadioContract`
