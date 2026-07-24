# Menu

Compact list of actions with full keyboard behavior.

- Family: navigation
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Menu`
- Source: `design-system/components/navigation.tsx`
- Story: `design-system/stories/Navigation.stories.tsx#MenuContract`
- Control mode: controlled

## Public API

- Sizes: `default`
- Variants: `action-menu`
- States: `enabled`, `disabled`, `focus-visible`, `long-content`
- Accessible name: Required label prop names the menu; visible text names each menu item.

## Accessibility contract

- Menu and menuitem roles for application actions

## Keyboard

- Arrow keys move
- Escape closes
- Home and End move to edges

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Navigation.stories.tsx#MenuContract`
