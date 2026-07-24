# Form summary

Focusable invalid-submit summary with links to affected fields.

- Family: feedback
- Lifecycle: stable
- Version: 1.0.0
- Public export: `FormSummary`
- Source: `design-system/components/feedback.tsx`
- Story: `design-system/stories/Feedback.stories.tsx#FormSummaryContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `error`
- States: `empty`, `errors`, `focused`, `long-content`
- Accessible name: Visible title labels the alert; links identify invalid fields.

## Accessibility contract

- Alert labeled by a visible heading
- Links target invalid field IDs

## Keyboard

- Receives focus after invalid submit
- Links move to invalid fields

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Feedback.stories.tsx#FormSummaryContract`
