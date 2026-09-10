# Gradual blue-to-mint-to-yellow backgrounds

The three preview backgrounds now blend slowly from left to right, progressing from light blue through mint to pale yellow across the row. The transition spans the full width rather than beginning abruptly at the middle. Pink and vertical gradients are removed. UI content, the visible heading, and the layout are retained.

## Design-system colors

- Light blue: `semantic.color.action.tint`, `#E1F6FF`.
- Mint: `semantic.color.status.success.tint`, `#E8F7EF`.
- Yellow: `semantic.color.status.warning.tint`, `#FFF4D6`.

Only these colors and their interpolations were requested. Their decorative use and raster limitation are recorded under `home-how-it-works-screenshot-previews` in the exception registry, with owner, scope, rationale, and expiration. The images are not live CSS token bindings. A transparent extraction attempt failed to produce alpha and was discarded; the finished backgrounds were edited with the built-in image tool and encoded as WebP.

## Final assets

- `public/images/home-step-create-test-actual.webp`
- `public/images/home-step-get-testers-actual.webp`
- `public/images/home-step-gain-insights-actual.webp`

## Validation

- **Fast-checked**: exception formatting and design-system invariants passed.
- All three images retain 1448 × 1086 dimensions and 4:3 proportions.
- Visually inspected at 1440 × 900 and 390 × 844; all three images load and there is no horizontal overflow. Review captures are `gradual-gradient-desktop.png`, `gradual-gradient-mobile.png`, and `gradual-gradient-mobile-lower.png` beside this document.
- No layout, typography, route behavior, or visual baseline changes.

## Final prompts

### create-test

Use case: precise-object-edit. Edit this exact existing Test4Test homepage screenshot, changing ONLY the decorative background. Keep all text verbatim, UI elements, controls, white form panels/recording cards, original screenshot thumbnails, and their exact scale and placement. Keep 1448x1086 canvas. OPAQUE finished image, no transparency or checkerboard. Background is a very gradual seamless strictly HORIZONTAL LEFT-TO-RIGHT gradient. No top-to-bottom or diagonal change, no bands or midline, no flat first half, no pink, no gray or white endpoint. Colors blend slowly across the FULL width. This image is ONE THIRD of one continuous gradient stretching across three adjacent cards: the whole sequence starts at pale light blue #E1F6FF, reaches pale mint #E8F7EF at the global midpoint, and ends at pale yellow #FFF4D6. These are the only approved source colors; interpolation between them is allowed. The first card is predominantly light blue, the middle predominantly mint, and the last predominantly pale yellow. No extra icons, decoration, shadows, texture, frames, text, or large step numbers. For this FIRST create-test card render ONLY the left third of that overall gradient. Begin with pure pale blue #E1F6FF on the far left and blend so slowly that the right edge has progressed only two-thirds of the way toward mint #E8F7EF (i.e. a pale aqua between blue and mint). Keep blue prominent across this first image. Preserve the small actual 1–2–3 form progress indicator and white form surface exactly.

### get-testers

Use case: precise-object-edit. Edit this exact existing Test4Test homepage screenshot, changing ONLY the decorative background. Keep all text verbatim, UI elements, controls, white form panels/recording cards, original screenshot thumbnails, and their exact scale and placement. Keep 1448x1086 canvas. OPAQUE finished image, no transparency or checkerboard. Background is a very gradual seamless strictly HORIZONTAL LEFT-TO-RIGHT gradient. No top-to-bottom or diagonal change, no bands or midline, no flat first half, no pink, no gray or white endpoint. Colors blend slowly across the FULL width. This image is ONE THIRD of one continuous gradient stretching across three adjacent cards: the whole sequence starts at pale light blue #E1F6FF, reaches pale mint #E8F7EF at the global midpoint, and ends at pale yellow #FFF4D6. These are the only approved source colors; interpolation between them is allowed. The first card is predominantly light blue, the middle predominantly mint, and the last predominantly pale yellow. No extra icons, decoration, shadows, texture, frames, text, or large step numbers. For this SECOND get-testers card render ONLY the middle third of that overall gradient. Begin at pale aqua obtained by mixing one-third blue #E1F6FF and two-thirds mint #E8F7EF. Across the full width, slowly blend through exact pale mint #E8F7EF in the center, and finish at a mint-yellow mixture of two-thirds mint #E8F7EF and one-third yellow #FFF4D6. Keep the entire white Share Palette Pilot panel exactly. Remove the old vertical blue-to-green direction. It must progress ONLY left to right.

### gain-insights

Use case: precise-object-edit. Edit this exact existing Test4Test homepage screenshot, changing ONLY the decorative background. Keep all text verbatim, UI elements, controls, white form panels/recording cards, original screenshot thumbnails, and their exact scale and placement. Keep 1448x1086 canvas. OPAQUE finished image, no transparency or checkerboard. Background is a very gradual seamless strictly HORIZONTAL LEFT-TO-RIGHT gradient. No top-to-bottom or diagonal change, no bands or midline, no flat first half, no pink, no gray or white endpoint. Colors blend slowly across the FULL width. This image is ONE THIRD of one continuous gradient stretching across three adjacent cards: the whole sequence starts at pale light blue #E1F6FF, reaches pale mint #E8F7EF at the global midpoint, and ends at pale yellow #FFF4D6. These are the only approved source colors; interpolation between them is allowed. The first card is predominantly light blue, the middle predominantly mint, and the last predominantly pale yellow. No extra icons, decoration, shadows, texture, frames, text, or large step numbers. For this THIRD gain-insights card render ONLY the right third of that overall gradient. Begin at a subtle mint-yellow mixture of two-thirds mint #E8F7EF and one-third yellow #FFF4D6 and blend slowly across the entire width into pale yellow #FFF4D6 at the far right. Remove ALL pink/peach. Apply this to the overall background around cards and behind the report text, keeping two recording cards and controls white. Keep all headings, labels, report content and thumbnails exactly.
