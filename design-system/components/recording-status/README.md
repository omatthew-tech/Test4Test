# Recording status

Permission, capture, upload, retry, and recovery feedback.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `RecordingStatus`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#RecordingStatusContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `permission`, `recording`, `upload`, `complete`, `error`
- States: `permission`, `capturing`, `uploading`, `retry`, `complete`
- Accessible name: Visible status and description are exposed in a polite live region.

## Accessibility contract

- Live status text
- Progress has an accessible name

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#RecordingStatusContract`
