# Video player

Native video with familiar playback controls and optional clip handles on a single timeline.

- Family: product
- Lifecycle: beta
- Version: 1.0.0
- Public export: `VideoPlayer`
- Source: `design-system/components/video-player.tsx`
- Story: `design-system/stories/VideoPlayer.stories.tsx#VideoPlayerContract`
- Control mode: both

## Public API

- Sizes: `responsive`
- Variants: `playback`, `clipping`
- States: `paused`, `playing`, `muted`, `focus-visible`, `unavailable`, `fullscreen`
- Accessible name: Required label names the video and player; each playback control has an explicit label.

## Accessibility contract

- Native HTML video preserves media events and transcript synchronization
- One labeled playback slider with optional independently labeled clip handles
- Controls remain visible and operable by touch or keyboard
- Fullscreen includes the timeline and handles when supported
- Playback errors are announced with recovery text

## Keyboard

- Enter or Space activates playback controls
- Arrow keys seek and adjust volume
- Clip handles retain the Timeline range keyboard contract
- Escape exits browser fullscreen

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/VideoPlayer.stories.tsx#VideoPlayerContract`
