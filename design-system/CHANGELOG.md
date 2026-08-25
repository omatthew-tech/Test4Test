# Test4Test design-system changelog

## Unreleased

- Added a deterministic, native-Figma DTCG variable export generated from the canonical tokens, with documented conversions for font families, font weights, and durations.
- Documented the recording-first product decision and future transcript, annotation, clip, priority, AI-context, star-rating, and managed-order interface needs.
- Added a semantic 288 px compact-form width for focused lead-capture compositions.
- Replaced the Test4Test mark with the two-tone exchange loop: a single vector outline drawn twice, the second copy rotated a half turn, shared by `Test4TestMark`, the favicon, the standalone mark, and the social card.
- Reworked brand rasterisation to letterbox the wider-than-tall mark instead of cropping it, downsample from a high-resolution render, flatten the icons platforms composite against black, and emit palette PNGs; the icon set and social card together drop from 54 KB to 26 KB.
- Kept one mark at every size rather than adding a pixel-fitted 16 px glyph: Chrome, Firefox, and Edge resolve `favicon.svg` ahead of the sized PNGs, so a second outline would reach almost nobody while splitting the brand in two. Tabs on 2× displays already rasterise at 32 px, where the arrowheads resolve.
- Refreshed the visual baselines for the new mark. The 1 % `maxDiffPixelRatio` tolerance absorbs a header logo swap, so the baselines were rewritten in full; 115 of 356 changed, and the rest are component stories that never render the mark.

## 1.0.0

- Replaced the legacy warm/orange stylesheet and glossy mascot language.
- Added the Aegean and cool-neutral token architecture, Geist typography, responsive foundations, motion, shape, elevation, and accessibility rules.
- Added 50 typed React components with machine-readable contracts, Storybook documentation, interaction tests, validation, accessibility, and visual-regression tooling.
- Migrated the marketing and authenticated Test4Test application to the canonical system.
- Added deterministic, production-excluded fixtures for every route family, 352 visual baselines, 69 Storybook component checks, and 97 automated route/accessibility checks.
- Enforced exact Storybook coverage annotations for every catalog size, variant, and state; added public-navigation and toast-tone baselines plus complete disabled rating and recording error-tone APIs.
- Added a canonical machine-readable route-state registry that is validated against the application router and consumed by both accessibility and visual suites.
- Standardized every Lucide instance on the 16, 20, or 24 px semantic icon scale and the canonical 2 px stroke, with repository enforcement.
- Routed global design-system installation through the public barrel and added integrity checks for official Geist files and token-derived static brand formats.
- Replaced the glossy mascot asset family with a code-native Aegean identity, self-hosted Geist fonts, and flat product compositions.
- Retired `style_sheet.md`, the 11,743-line global stylesheet, obsolete branding documentation, mascot components, and legacy favicon/PNG assets.
