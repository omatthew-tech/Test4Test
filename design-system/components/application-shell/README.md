# Application shell

Header, main landmark, and footer frame shared by Test4Test routes.

- Family: layout
- Lifecycle: stable
- Version: 1.0.0
- Public export: `ApplicationShell`
- Source: `design-system/components/layout.tsx`
- Story: `design-system/stories/Layout.stories.tsx#ApplicationShellContract`
- Control mode: not-applicable

## Public API

- Sizes: `responsive`
- Variants: `header-main-footer`
- States: `default`, `narrow-width`, `long-content`
- Accessible name: The main landmark is identified by mainId and reached by the skip link.

## Accessibility contract

- Native main landmark
- Stable skip-link target

## Keyboard

- Skip link moves focus to main content

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Layout.stories.tsx#ApplicationShellContract`
