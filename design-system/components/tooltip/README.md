# Tooltip

Brief supplemental text available to pointer and keyboard.

- Family: overlays
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Tooltip`
- Source: `design-system/components/overlays.tsx`
- Story: `design-system/stories/Overlays.stories.tsx#TooltipContract`
- Control mode: uncontrolled

## Public API

- Sizes: `content-defined`
- Variants: `supplemental-text`
- States: `hidden`, `hover`, `focus`, `dismissed`
- Accessible name: The trigger keeps its own name and references the tooltip as a description.

## Accessibility contract

- Tooltip role
- Trigger described by tooltip

## Keyboard

- Appears on focus
- Escape dismisses

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Overlays.stories.tsx#TooltipContract`
