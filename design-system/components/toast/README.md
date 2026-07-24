# Toast

Brief non-blocking status with an accessible live region.

- Family: feedback
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Toast`
- Source: `design-system/components/feedback.tsx`
- Story: `design-system/stories/Feedback.stories.tsx#ToastContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `info`, `success`, `warning`, `danger`
- States: `closed`, `open`, `long-content`
- Accessible name: Visible title and content announced by the live-region role.

## Accessibility contract

- Polite status region by default
- Does not steal focus

## Keyboard

- Dismiss action is reachable

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Feedback.stories.tsx#ToastContract`
