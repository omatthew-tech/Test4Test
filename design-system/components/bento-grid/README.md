# Bento grid

Deliberate asymmetric summary grid, not a default layout.

- Family: layout
- Lifecycle: stable
- Version: 1.0.0
- Public export: `BentoGrid`
- Source: `design-system/components/layout.tsx`
- Story: `design-system/stories/Layout.stories.tsx#BentoGridContract`
- Control mode: not-applicable

## Public API

- Sizes: `responsive`
- Variants: `standard`, `wide-item`
- States: `default`, `narrow-width`, `long-content`
- Accessible name: Semantic child order remains meaningful without the grid.

## Accessibility contract

- Semantic child order is independent of visual span

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Layout.stories.tsx#BentoGridContract`
