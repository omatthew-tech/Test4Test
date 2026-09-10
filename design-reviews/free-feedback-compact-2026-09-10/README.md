# Compact alternating feedback section

Implemented only the selected homepage section. Existing text, heading semantics, button destinations, and other sections are unchanged.

- Both illustrations use compact 3:2 panels; only blank outer background is trimmed by the image presentation.
- Desktop panels are 536 × 357 CSS pixels at 1440 × 900. Row spacing is 32 pixels, using existing semantic tokens.
- Desktop descriptions use the existing lead typography. Both actions use the canonical large Button with body-size labels.
- The sharing illustration uses the approved pale-blue backdrop and outlined cards. All original illustration labels and icons are retained.
- The existing raster-art exception is updated to cover the selected light variant.

## Validation

Fast-checked CSS and exception documentation. Changed feedback TSX formatting, ESLint, TypeScript, and git diff whitespace checks pass. The full HomePage.tsx format check has an existing failure in the unchanged testable-products paragraph; verified against HEAD and left untouched.

Inspected 1440 × 900 and 390 × 844 in the browser. All images load, all section text matches the pre-change text, and mobile has no section overflow. Other homepage sections have identical content, widths, and heights. The section height decreases from 1189 to 969 CSS pixels on desktop.

Existing homepage route tests: 4 pass (320-pixel reflow, 200% text enlargement, forced colors/reduced motion, keyboard focus). Three fail for pre-existing reasons: the global accessibility check flags faded Trusted by text, and the two feedback layout checks still expect obsolete headings and no buttons. No tests or visual baselines were changed.

## Image provenance

Built-in image generation was used to edit the original sharing illustration, guided by the selected compact mockup. Converted to WebP with quality 92 at the original 1420 × 1108 dimensions.

Asset: `public/images/home-feedback-share-test-light.webp`

Final prompt:

Use case: precise-object-edit. Edit image 1 only; image 2 is the approved homepage mockup, a styling reference only. Output a standalone image of the sharing illustration from image1, same 1420x1108 dimensions and aspect ratio, same composition, card positions, shadows, all existing labels/icons and placeholder gray lines, no cropping or added content. Replace only the navy background with solid pale cyan #E1F6FF, and add restrained thin blue outlines around the two existing white cards as shown in the bottom-right illustration in the reference mockup. Do not include ANY of the surrounding webpage text, heading, or Get started button from image2. Keep the white Responses card, both blue and green avatars, exact labels 'Responses', 'Great onboarding flow!', 'The value prop is clear.'. Preserve exact Share test link card, chain-link icon, 'Share test link', 'test4test.io/t/your-test', and blue 'Copy link' button. No rewriting, typos, additions, extra elements, glow, gradients, or texture. Primary blue #007BAE, text #242A31, pale blue background #E1F6FF. Keep all original card contents unchanged. Output just the one standalone illustration.
