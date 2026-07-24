# Response viewer

Question, response, metadata, and response actions in a semantic article.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `ResponseViewer`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#ResponseViewerContract`
- Control mode: not-applicable

## Public API

- Sizes: `responsive`
- Variants: `with-actions`, `without-actions`
- States: `empty`, `populated`, `reported`, `long-content`, `narrow-width`
- Accessible name: Question heading names the response article; actions retain explicit names.

## Accessibility contract

- Article is named by its question heading
- Long responses wrap

## Keyboard

- Actions are independent focus targets

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#ResponseViewerContract`
