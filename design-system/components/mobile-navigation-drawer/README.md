# Mobile navigation drawer

Small-screen navigation with focus management.

- Family: navigation
- Lifecycle: stable
- Version: 1.0.0
- Public export: `MobileNavigationDrawer`
- Source: `design-system/components/navigation.tsx`
- Story: `design-system/stories/Navigation.stories.tsx#MobileNavigationDrawerContract`
- Control mode: controlled

## Public API

- Sizes: `mobile`
- Variants: `primary-navigation`
- States: `closed`, `open`, `focus-contained`
- Accessible name: Required title labels the modal drawer; navigation is named Primary.

## Accessibility contract

- Named navigation
- Dialog-like focus containment

## Keyboard

- Escape closes
- Focus restores to trigger

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Navigation.stories.tsx#MobileNavigationDrawerContract`
