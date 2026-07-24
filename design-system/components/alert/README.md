# Alert

Persistent contextual status message.

- Family: feedback
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Alert`
- Source: `design-system/components/feedback.tsx`
- Story: `design-system/stories/Feedback.stories.tsx#AlertContract`
- Control mode: not-applicable

## Public API

- Sizes: `responsive`
- Variants: `info`, `success`, `warning`, `danger`
- States: `routine`, `urgent`, `long-content`
- Accessible name: Visible title and content; danger uses alert, other tones use status.

## Accessibility contract

- Status for routine updates
- Alert for urgent failures

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Feedback.stories.tsx#AlertContract`
