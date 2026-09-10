# How it works background update

The homepage removes the outer step numbers and adds a visible “How it works” heading. Existing 4:3 screenshot assets receive three different surrounds: a vertical split, a lower horizontal band, and a thin inset frame. UI labels, workflow, and section descriptions stay intact.

Generated using the built-in image editing tool. The existing `home-how-it-works-screenshot-previews` exception covers these token-colored raster surrounds. Final assets:

- `public/images/home-step-create-test-actual.webp`
- `public/images/home-step-get-testers-actual.webp`
- `public/images/home-step-gain-insights-actual.webp`

## Validation

- **Fast-checked**: formatting, lint, TypeScript, and design-system invariants passed for the two changed page files.
- Visually inspected at 1440 × 900 and 390 × 844. All three 1448 × 1086 WebP images load, preserve 4:3 proportions, and stay within the viewport. The outer step numbers are absent and the section is named by its visible heading.
- `npm run ds:check:route -- home`: reflow at 320 px, 200% text enlargement, and forced-colors/reduced-motion checks pass. The accessibility check reports the existing faded Trusted by cards and caption at 3.23:1 contrast (expected 4.5:1). The route command stops before visual baseline comparison. Baselines were not changed.
- Screenshots: `background-update-desktop.png`, `background-update-mobile.png`, and `background-update-mobile-lower.png` in this directory.

## Prompts

### create-test

Use case: precise-object-edit. The reference is the exact existing Test4Test homepage screenshot asset to edit, not inspiration. Change ONLY the surrounding background outside the existing white product-interface panel. Preserve all original interface pixels, all labels and entered content, every button, layout, typography, original screenshots within the UI, and small progress indicator where present. Keep the exact original landscape 4:3 composition and size relationships. Crisp minimal flat geometric treatment. No gradients, textures, shadows, patterns, added icons, text, large step numbers, perspective, browser chrome, or invented UI. Colors are existing design-system tokens: pale blue #E1F6FF, cool gray #F4F7F9, white #FFFFFF, pale border #D9DFE3. For the create-test asset: make the surrounding background uniformly pale blue #E1F6FF with a broad cool-gray vertical band along the left quarter, continuing behind the white form card. Retain the small actual connected 1–2–3 progress indicator above the form exactly. The left band is a flat solid rectangle with a clean vertical edge. All form content stays in place.

### get-testers

Use case: precise-object-edit. The reference is the exact existing Test4Test homepage screenshot asset to edit, not inspiration. Change ONLY the surrounding background outside the existing white product-interface panel. Preserve all original interface pixels, all labels and entered content, every button, layout, typography, original screenshots within the UI, and small progress indicator where present. Keep the exact original landscape 4:3 composition and size relationships. Crisp minimal flat geometric treatment. No gradients, textures, shadows, patterns, added icons, text, large step numbers, perspective, browser chrome, or invented UI. Colors are existing design-system tokens: pale blue #E1F6FF, cool gray #F4F7F9, white #FFFFFF, pale border #D9DFE3. For the get-testers asset: replace the pale blue surround with flat cool gray #F4F7F9 and a pale-blue #E1F6FF horizontal band along the bottom quarter, continuing behind the white Share Palette Pilot card. A clean horizontal edge, no gradient. Keep the full original share-link UI and all its text exactly.

### gain-insights

Use case: precise-object-edit. The reference is the exact existing Test4Test homepage screenshot asset to edit, not inspiration. Change ONLY the surrounding background outside the existing white product-interface panel. Preserve all original interface pixels, all labels and entered content, every button, layout, typography, original screenshots within the UI, and small progress indicator where present. Keep the exact original landscape 4:3 composition and size relationships. Crisp minimal flat geometric treatment. No gradients, textures, shadows, patterns, added icons, text, large step numbers, perspective, browser chrome, or invented UI. Colors are existing design-system tokens: pale blue #E1F6FF, cool gray #F4F7F9, white #FFFFFF, pale border #D9DFE3. For the gain-insights asset: change the pale-blue outer surround to white #FFFFFF with a thin inset rectangular pale-blue #E1F6FF frame running around the original white analytics panel. Keep the existing narrow margin and existing panel size so all analytics text remains legible. The frame is flat, geometric, and follows the panel. Preserve BOTH recording thumbnails exactly, all recording labels, transcript report copy and controls.
