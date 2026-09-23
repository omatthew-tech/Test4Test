# Review feedback onboarding screenshot

`public/images/onboarding-review-feedback.webp` is an actual browser screenshot
of the application's `RecordingViewPage`, `RecordingClipEditor`, `VideoPlayer`,
and `TimelineRange`. The final onboarding step uses the existing responsive
image treatment and descriptive alternative text. No interface was redrawn or
AI-generated.

The editor shows a 0:24–0:50 selection with Save clip and Preview clip. The
capture uses isolated local fixtures and illustrative media, not a customer's
recording. `sample-frame.png` is an actual screenshot of the local Test4Test
homepage, encoded as a 90-second still video in `sample-recording.mp4`.

`preview.mjs` starts a capture-only Vite server on port 5183. Its transform
substitutes that sample video for the existing development recording fixture;
production recording code and data are untouched. Open
`/recordings?ds-user=user-mateo&ds-recordings=2&ds-recording-media=demo`, select
Clip, and adjust the handles to 0:24 and 0:50. `editor-full.png` preserves the
uncropped browser capture. `render.mjs` crops it around the recording, timeline,
and clip controls, then encodes the 824 × 440 WebP. Run both scripts from the
repository root.

Validation: `npm run ds:check:fast -- src/pages/FounderWelcomeTour.tsx` and the
existing welcome tour journeys at 390 × 844 and 1440 × 900, including keyboard
focus, navigation, platform handoff, and automated accessibility checks.
Screenshots are in `validation/`. No visual baselines were updated.
