# Homepage sharing demo

Tier 2: replace only the media beside “Bring your own testers”. Preserve the current alternating layout, 3:2 media ratio, action-tint background, rounded corners, copy, and Get started action.

## Delivery

| Asset | Dimensions | Bytes |
| --- | --- | ---: |
| AV1 MP4, preferred | 1440 × 960, 30 fps, 7 seconds | 98,887 |
| H.264 MP4, fallback | 1440 × 960, 30 fps, 7 seconds | 137,881 |
| WebP poster | 1152 × 768 | 17,458 |
| Previous light illustration | 1420 × 1108, displayed at 3:2 | 54,298 |

Both videos omit audio and put MP4 metadata first for progressive playback. AV1 is declared with its actual codec/profile/level (`av01.0.08M.08`), allowing unsupported browsers to choose H.264. The 1440-pixel video exceeds twice the observed 536-pixel desktop slot width. The crop removes only surrounding backdrop from the approved demo, preserving all UI content.

Video source URLs are absent before the media enters the viewport. The poster is lazy loaded. Playback pauses outside the viewport and when the document is hidden. Reduced-motion and Save-Data preferences keep the static poster and do not request video files. The concurrent owner-requested removal of the visible playback control is preserved and documented in `home-share-test-demo` in the exception register.

The videos transfer more bytes than the previous illustration when viewed; this is not a claim of identical total page weight or measured field loading speed. Tests establish that video downloads do not compete with initial above-the-fold loading. No player package or external media service was added.

## Verification

- Fast check passes: formatting, lint, TypeScript, design-system invariants.
- Six focused browser tests pass: desktop/mobile placement and stable dimensions, deferred network requests, viewport pause/resume, reduced motion, data saving, poster recovery, and actual H.264 playback after an AV1 load failure.
- Scoped Axe checks pass for the free-feedback section.
- Visual inspection at 390 × 844 and 1440 × 900: `mobile.png`, `desktop.png`.
- AV1 versus the lossless master: timebase-aligned FFmpeg SSIM 0.999677. Frames were also inspected visually. This metric supports compression fidelity, not a guarantee of perceptual equality.
- The broader homepage route check stops on existing contrast failures in the faded Trusted by cards and caption (3.23:1). Its reflow, text enlargement, and forced-color/reduced-motion checks pass. See `route-check.log`. That design is covered by the existing `home-trusted-by-faded` exception and was not changed here.
- All four full-page visual comparisons differ from the stored homepage screenshots, which still contain the earlier page design and image. See `visual-check.log`. No baselines were updated; the final video placement was checked directly at desktop and mobile sizes.

## Reproduction

Run `node design-mockups/bring-your-own-testers-video/render.mjs --web` to create the 1440 × 960 lossless master and cropped poster. Encode the master with:

- AV1: `libaom-av1`, CRF 30, bitrate 0, CPU-used 4, row-mt 1, GOP 240, `yuv420p`, `+faststart`.
- H.264: `libx264`, veryslow preset, animation tune, CRF 20, `yuv420p`, `+faststart`.
- Poster: Sharp, resize to 1152 × 768, WebP quality 86, effort 6, smart subsampling.

Reference: [web.dev video lazy loading](https://web.dev/articles/lazy-loading-video) and [MDN video element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video). The implementation uses IntersectionObserver and delayed source attachment so it does not depend on newer native video lazy-loading support.
