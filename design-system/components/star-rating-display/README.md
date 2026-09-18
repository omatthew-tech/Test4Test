# Star rating display

Read-only exact 1–5 star rating or Not rated.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `StarRatingDisplay`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#StarRatingDisplayContract`
- Control mode: not-applicable

## Public API

- Sizes: `default`
- Variants: `rated`, `unrated`
- States: `rated`, `unrated`
- Accessible name: Rated values announce N out of 5 stars once. Unrated values say Not rated. Decorative stars are hidden from assistive technology.

## Accessibility contract

- Single accessible image for rated feedback
- Text for unrated feedback

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#StarRatingDisplayContract`
