# Tabs

Related view switching with roving focus.

- Family: navigation
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Tabs`
- Source: `design-system/components/navigation.tsx`
- Story: `design-system/stories/Navigation.stories.tsx#TabsContract`
- Control mode: both

## Public API

- Sizes: `responsive`
- Variants: `automatic-activation`
- States: `selected`, `unselected`, `focus-visible`, `long-label`, `overflow`
- Accessible name: Visible tab labels name tabs and panels.

## Accessibility contract

- tablist, tab, and tabpanel roles
- Selected state is explicit

## Keyboard

- Arrow keys move focus
- Home and End move to edges

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Navigation.stories.tsx#TabsContract`
