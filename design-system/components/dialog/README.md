# Dialog

Modal task or confirmation using the native dialog element.

- Family: overlays
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Dialog`
- Source: `design-system/components/overlays.tsx`
- Story: `design-system/stories/Overlays.stories.tsx#DialogContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `dialog`
- States: `closed`, `open`, `focus-contained`, `long-content`, `destructive`
- Accessible name: Required title prop labels the native dialog.

## Accessibility contract

- Native dialog
- Labeled title
- Modal state

## Keyboard

- Escape closes
- Tab remains within
- Focus restores

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Overlays.stories.tsx#DialogContract`
