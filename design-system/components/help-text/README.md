# Help text

Persistent field guidance referenced by the owning control.

- Family: inputs
- Lifecycle: stable
- Version: 1.0.0
- Public export: `HelpText`
- Source: `design-system/components/inputs.tsx`
- Story: `design-system/stories/Inputs.stories.tsx#HelpTextContract`
- Control mode: not-applicable

## Public API

- Sizes: `default`
- Variants: `field-guidance`
- States: `default`, `long-content`
- Accessible name: Referenced by the owning field through aria-describedby.

## Accessibility contract

- Referenced through aria-describedby
- Never replaces a persistent label

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Inputs.stories.tsx#HelpTextContract`
