# Timeline range

Two time handles for selecting a media range with pointer and keyboard input.

- Family: inputs
- Lifecycle: beta
- Version: 1.0.0
- Public export: `TimelineRange`
- Source: `design-system/components/timeline-range.tsx`
- Story: `design-system/stories/TimelineRange.stories.tsx#TimelineRangeContract`
- Control mode: controlled

## Public API

- Sizes: `default`
- Variants: `media`
- States: `enabled`, `focus-visible`, `disabled`, `narrow-range`
- Accessible name: Required label names the group; Clip start and Clip end name each slider.

## Accessibility contract

- Two labeled sliders with time value text
- Handles cannot cross
- Opposite vertical targets keep narrow ranges operable

## Keyboard

- Arrow keys adjust one step
- Shift and arrows adjust ten steps
- Page keys adjust ten seconds
- Home and End reach the permitted limits

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/TimelineRange.stories.tsx#TimelineRangeContract`
