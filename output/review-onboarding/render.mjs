import sharp from "sharp";

// Focus on the bottom of the recorded page, trim handles, and open clip editor.
await sharp("output/review-onboarding/editor-full.png")
  .extract({ left: 220, top: 532, width: 824, height: 440 })
  .webp({ quality: 92 })
  .toFile("public/images/onboarding-review-feedback.webp");
