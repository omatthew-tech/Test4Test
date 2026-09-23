# Share onboarding walkthrough

The app asset is `public/videos/onboarding-share-test.mp4` (4.8 seconds, 1000 × 560, 30 fps, silent H.264 with fast-start metadata). Its static confirmation poster is `public/videos/onboarding-share-test-poster.webp`.

This is a screenshot-based walkthrough of the actual local Test4Test UI, with an animated native Windows pointer and a camera crop that follows the Copy link action. It is not an AI-generated reconstruction or a continuous screen recording. The browser was used to click the actual Share navigation and Copy link button and capture the resulting hover and Copied states.

The final clip starts on the Share page and stays there. The opening 1.4 seconds of navigation are omitted; the Copy link action, close-up, and Copied confirmation are retained.

Local fixtures were temporarily labeled Test4Test with the example link `https://test4test.io/test/test4test` for capture. Those capture-only source changes were reverted. No production data was changed.

The numbered PNG files are the captured source states. `render.mjs` builds the MP4 and poster with the installed FFmpeg and Sharp. Run it from the repository root. The cursor timings are defined in the renderer; the surrounding app's typography, controls, borders and colors come directly from the screenshots.

The onboarding integration automatically loops without a visible playback control, as requested on 2026-09-22. It pauses when the tab is hidden and resumes when visible, and suppresses automatic playback for reduced motion or data saving. A poster and text equivalent cover unsupported media and errors.

Validation: targeted onboarding journeys at 390 × 844 and 1440 × 900, keyboard navigation, automated accessibility, reduced motion, data saving and failed-media fallback. Visual baselines were not changed.
