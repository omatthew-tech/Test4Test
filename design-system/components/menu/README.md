# Menu

Compact action list, standalone or opened by an optional button trigger. Dropdowns align to start or end; separatorBefore groups items. Row backgrounds highlight only on hover; keyboard focus retains the standard focus outline. Existing standalone calls remain supported.

- Family: navigation
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Menu`
- Source: `design-system/components/navigation.tsx`
- Story: `design-system/stories/Navigation.stories.tsx#MenuContract`
- Control mode: uncontrolled

## Public API

- Sizes: `default`
- Variants: `action-menu`
- States: `enabled`, `disabled`, `focus-visible`, `long-content`
- Accessible name: Required label prop names the menu; visible text names each menu item.

## Accessibility contract

- Menu and menuitem roles for application actions
- Button trigger exposes aria-haspopup, aria-expanded, and aria-controls
- Separators are not focusable

## Keyboard

- Arrow keys move past disabled items
- Escape closes and restores trigger focus
- Home and End move to edges
- Enter or Space opens and selects
- Arrow Down or Up on the trigger opens at the first or last enabled item
- Tab closes without trapping focus

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Navigation.stories.tsx#MenuContract`
- `design-system/stories/Navigation.stories.tsx#ProfileMenuDropdown`
