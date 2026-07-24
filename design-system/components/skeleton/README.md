# Skeleton

Structure-preserving loading placeholder.

- Family: feedback
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Skeleton`
- Source: `design-system/components/feedback.tsx`
- Story: `design-system/stories/Feedback.stories.tsx#SkeletonContract`
- Control mode: not-applicable

## Public API

- Sizes: `content-defined`
- Variants: `block`
- States: `loading`, `reduced-motion`
- Accessible name: Hidden from assistive technology; the parent owns aria-busy and status text.

## Accessibility contract

- Hidden from assistive technology
- Parent exposes busy state

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Feedback.stories.tsx#SkeletonContract`
