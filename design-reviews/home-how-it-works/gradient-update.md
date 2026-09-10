# How it works gradient backgrounds

The outer step numbers remain removed and the visible “How it works” heading is retained. The user requested smooth gradients in place of the previous bands and frame, with transitions beginning around the middle and a different hue for the final card.

- Create your test: cool gray to pale blue, left to right.
- Get testers: pale blue to mint, top to bottom.
- Gain insights: cream to blush, left to right. The flat analytics backing receives the gradient so the warm color is visible; recording cards and controls retain their white surfaces.

Generated with the built-in image editing tool and encoded as WebP. The `home-how-it-works-screenshot-previews` exception records the explicitly requested gradients and their token-derived colors.

## Final assets

- `public/images/home-step-create-test-actual.webp`
- `public/images/home-step-get-testers-actual.webp`
- `public/images/home-step-gain-insights-actual.webp`

## Validation

- **Fast-checked**: exception formatting and design-system invariants passed.
- All three assets retain 1448 × 1086 dimensions and 4:3 proportions.
- Visually inspected at 1440 × 900 and 390 × 844; images load and the page has no horizontal overflow. Screenshots are saved beside this document as `gradient-desktop.png`, `gradient-mobile.png`, and `gradient-mobile-lower.png`.
- No layout, copy, route behavior, or visual baseline changes in this revision.

## Prompts

### create-test

Use case: precise-object-edit. Edit the supplied existing Test4Test homepage screenshot asset. The user explicitly wants a simple smooth GRADIENT background, replacing the previous geometric band/frame treatment. Preserve all interface text verbatim, all controls, icons, form fields and entered values, original recording thumbnails, exact layout and scale, and existing small progress indicator when present. Keep exact 1448x1086 landscape 4:3 proportions. Do not add large step numbers, titles, patterns, texture, shadows, glows, objects or perspective. No hard bands, diagonal cut edges, color blocks, outlines, inset frames, or borders in the backdrop. One seamless linear gradient only, behind the UI. The starting color stays steady through roughly the first 45–50% of the rectangle, then smoothly blends to the ending color at the far edge. The transition must be visibly smooth, broad and gentle, never a seam. CREATE TEST: Replace both the gray left strip and blue surround with one LEFT-TO-RIGHT gradient: cool pale gray #F4F7F9 from the left through the middle, then softly transition to pale sky blue #E1F6FF at the right edge. Keep the white form panel and the small actual 1–2–3 progress indicator exactly.

### get-testers

Use case: precise-object-edit. Edit the supplied existing Test4Test homepage screenshot asset. The user explicitly wants a simple smooth GRADIENT background, replacing the previous geometric band/frame treatment. Preserve all interface text verbatim, all controls, icons, form fields and entered values, original recording thumbnails, exact layout and scale, and existing small progress indicator when present. Keep exact 1448x1086 landscape 4:3 proportions. Do not add large step numbers, titles, patterns, texture, shadows, glows, objects or perspective. No hard bands, diagonal cut edges, color blocks, outlines, inset frames, or borders in the backdrop. One seamless linear gradient only, behind the UI. The starting color stays steady through roughly the first 45–50% of the rectangle, then smoothly blends to the ending color at the far edge. The transition must be visibly smooth, broad and gentle, never a seam. GET TESTERS: Replace the gray background and bottom blue band with one TOP-TO-BOTTOM gradient: pale sky blue #E1F6FF from the top through the middle, then softly transition to pale mint green #E8F7EF at the bottom edge. Keep the complete white Share Palette Pilot card exactly.

### gain-insights

Use case: precise-object-edit. Edit the supplied existing Test4Test homepage screenshot asset. The user explicitly wants a simple smooth GRADIENT background, replacing the previous geometric band/frame treatment. Preserve all interface text verbatim, all controls, icons, form fields and entered values, original recording thumbnails, exact layout and scale, and existing small progress indicator when present. Keep exact 1448x1086 landscape 4:3 proportions. Do not add large step numbers, titles, patterns, texture, shadows, glows, objects or perspective. No hard bands, diagonal cut edges, color blocks, outlines, inset frames, or borders in the backdrop. One seamless linear gradient only, behind the UI. The starting color stays steady through roughly the first 45–50% of the rectangle, then smoothly blends to the ending color at the far edge. The transition must be visibly smooth, broad and gentle, never a seam. GAIN INSIGHTS: This third card must be visibly WARM and a different color from the first two. Remove the thin cyan frame entirely. Replace the overall page background, including the large flat white backing behind the View recordings heading and Transcript report content, with one LEFT-TO-RIGHT gradient: pale warm cream #FFF4D6 from the left through the middle, then softly transition to pale blush pink #FDECEF at the right edge. Preserve the two white recording cards, their thumbnails and labels, ALL report text, and buttons exactly. Keep their alignment, position, and proportions. Only the flat page backdrop changes to gradient; the two recording cards and white buttons remain white. No extra outline.
