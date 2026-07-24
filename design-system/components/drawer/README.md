# Drawer

Edge-aligned modal panel with dialog behavior.

- Family: overlays
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Drawer`
- Source: `design-system/components/overlays.tsx`
- Story: `design-system/stories/Overlays.stories.tsx#DrawerContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `right-edge`
- States: `closed`, `open`, `focus-contained`, `long-content`
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

- `design-system/stories/Overlays.stories.tsx#DrawerContract`
