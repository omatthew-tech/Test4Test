# Rating control

Labeled single-choice rating scale.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `RatingControl`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#RatingControlContract`
- Control mode: controlled

## Public API

- Sizes: `default`
- Variants: `numeric-range`
- States: `unselected`, `selected`, `focus-visible`, `disabled`
- Accessible name: Required legend labels the radio group; numbers label options.

## Accessibility contract

- Fieldset and legend
- Native radio inputs

## Keyboard

- Arrow keys move
- Space selects

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#RatingControlContract`
