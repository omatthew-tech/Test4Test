# Page header

Route title, supporting copy, and primary actions.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `PageHeader`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#PageHeaderContract`
- Control mode: not-applicable

## Public API

- Sizes: `responsive`
- Variants: `with-actions`, `without-actions`
- States: `default`, `long-content`, `narrow-width`
- Accessible name: Required title prop renders the route h1.

## Accessibility contract

- One h1 per route
- Actions follow title and description

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#PageHeaderContract`
