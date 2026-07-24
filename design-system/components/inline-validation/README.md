# Inline validation

Field-specific error or recovery guidance.

- Family: feedback
- Lifecycle: stable
- Version: 1.0.0
- Public export: `InlineValidation`
- Source: `design-system/components/feedback.tsx`
- Story: `design-system/stories/Feedback.stories.tsx#InlineValidationContract`
- Control mode: not-applicable

## Public API

- Sizes: `default`
- Variants: `error`
- States: `present`, `long-content`
- Accessible name: Referenced from the invalid field through aria-describedby.

## Accessibility contract

- Associated by aria-describedby
- Error text is not color-only

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Feedback.stories.tsx#InlineValidationContract`
