# Popover

Anchored supplemental content with explicit dismissal.

- Family: overlays
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Popover`
- Source: `design-system/components/overlays.tsx`
- Story: `design-system/stories/Overlays.stories.tsx#PopoverContract`
- Control mode: uncontrolled

## Public API

- Sizes: `content-defined`
- Variants: `anchored-dialog`
- States: `closed`, `open`, `focus-visible`, `long-content`
- Accessible name: Required label prop labels the popover dialog.

## Accessibility contract

- Trigger exposes expanded and controls states

## Keyboard

- Escape closes
- Focus returns to trigger

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Overlays.stories.tsx#PopoverContract`
