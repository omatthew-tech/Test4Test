# Top navigation

Desktop navigation with a compact mobile disclosure below the header. Optional icons and mobile account items keep primary navigation, account destinations, and guest actions grouped without a nested menu.

- Family: navigation
- Lifecycle: stable
- Version: 1.0.0
- Public export: `TopNavigation`
- Source: `design-system/components/navigation.tsx`
- Story: `design-system/stories/Navigation.stories.tsx#TopNavigationContract`
- Control mode: uncontrolled

## Public API

- Sizes: `responsive`
- Variants: `public`, `authenticated`
- States: `default`, `current-route`, `mobile`
- Accessible name: Primary navigation landmark and Test4Test home link.

## Accessibility contract

- Header and named Primary and Account navigation landmarks
- Current page uses aria-current
- Disclosure trigger exposes aria-expanded and aria-controls
- Non-modal content follows the trigger in document order

## Keyboard

- Enter or Space toggles the disclosure
- ArrowDown opens and focuses the first link
- Tab follows document order and closes when focus leaves the header
- Escape closes and restores trigger focus
- Outside pointer, route changes, and desktop resizing dismiss the disclosure

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Navigation.stories.tsx#TopNavigationContract`
- `design-system/stories/Navigation.stories.tsx#CompactVisitorNavigation`
- `design-system/stories/Navigation.stories.tsx#CompactMemberNavigation`
