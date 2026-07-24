# Button

Text action with primary, secondary, quiet, and destructive emphasis.

- Family: actions
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Button`
- Source: `design-system/components/actions.tsx`
- Story: `design-system/stories/Actions.stories.tsx#ButtonContract`
- Control mode: uncontrolled

## Public API

- Sizes: `compact`, `default`, `large`
- Variants: `primary`, `secondary`, `quiet`, `danger`
- States: `enabled`, `hover`, `focus-visible`, `pressed`, `disabled`, `loading`
- Accessible name: Visible children, or loadingLabel while loading.

## Accessibility contract

- Native button semantics
- Loading state preserves accessible name

## Keyboard

- Enter activates
- Space activates

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Actions.stories.tsx#ButtonContract`
