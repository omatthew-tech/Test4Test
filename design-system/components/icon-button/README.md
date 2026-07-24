# Icon button

Compact action for familiar icons with a required accessible label.

- Family: actions
- Lifecycle: stable
- Version: 1.0.0
- Public export: `IconButton`
- Source: `design-system/components/actions.tsx`
- Story: `design-system/stories/Actions.stories.tsx#IconButtonContract`
- Control mode: uncontrolled

## Public API

- Sizes: `compact`, `default`, `large`
- Variants: `secondary`, `quiet`, `danger`
- States: `enabled`, `hover`, `focus-visible`, `pressed`, `disabled`
- Accessible name: Required label prop.

## Accessibility contract

- Native button
- aria-label is required

## Keyboard

- Enter activates
- Space activates

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Actions.stories.tsx#IconButtonContract`
