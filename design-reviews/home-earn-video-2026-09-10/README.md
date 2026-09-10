# Homepage credit demo

Fast-checked. Tier 2: reuse of the existing route-local media composition.

Replaced the image to the left of “Earn 1:1 credits” with the approved 1620 × 1080, 7.2-second MP4. The file is 179,520 bytes, 80.1% smaller than the previous 900,802-byte WebP. Both homepage demos retain the existing 3:2 frame, copy, button routes, and CSS layout.

The local preview helper now accepts each method's video sources, dimensions, and posters. Sources attach only when the video is visible and the page is active. Playback pauses offscreen or in a hidden tab. Reduced-motion and data-saving preferences leave a static image; the credit clip uses its earned-credit confirmation. Playback controls are absent. Errors fall back to the static image, and the sharing clip retains its AV1/H.264 fallback behavior.

## Validation

- `npm run ds:check:fast -- src/pages/HomePage.tsx design-system/exceptions.json tests/playwright/home-earn-video-journeys.spec.ts` passed.
- `node scripts/run-playwright.mjs a11y tests/playwright/home-earn-video-journeys.spec.ts tests/playwright/home-share-video-journeys.spec.ts` passed all 11 checks, including the sharing codec fallback.
- Inspected the running homepage at 1440 × 900 and 390 × 844.
- Verified the installed MP4 is the approved 179,520-byte export, with matching poster and static confirmation assets.
- No visual baselines were updated. Existing unrelated working-tree changes were preserved.

The media exception is recorded as `home-feedback-demo-media` in `design-system/exceptions.json`.
