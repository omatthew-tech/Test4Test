# Homepage spacing implementation

Tier 2, Fast-checked. Changes are confined to `src/pages/HomePage.module.css` and homepage-local class names in `src/pages/HomePage.tsx`. No shared components, global tokens, other routes, content, images, handlers, or visual baselines were changed.

## Desktop changes

At the existing 1024 px breakpoint:

- Home section padding becomes 128 px; adjacent section grid gaps become zero. Measured content separation from the feedback section to the platforms section is 256 px at 1440 × 900.
- The alternating feedback rows have a 128 px vertical gap and an 80 px image-to-copy gutter.
- The platforms heading-to-grid gap is 64 px.
- The recruitment panel has 128 px vertical and 80 px horizontal padding, plus 64 px between its introductory group and comparison cards.
- The closing action is centered and receives 128 px section padding. A separate 128 px margin keeps its existing divider clear of the recruitment panel.
- The recruitment action wraps below its copy when the available card width is narrow; it remains beside the copy at 1440 px. This avoids squeezing the text after increasing the panel padding.

Below 1024 px, the existing section and feature spacing scales remain in use. The closing heading, description, and button are centered at all widths. Existing boundaries, illustrations, carousel behavior, and footer layout remain intact.

## Verification

- `npm run ds:check:fast -- src/pages/HomePage.module.css src/pages/HomePage.tsx` passed formatting, lint, TypeScript, and design-system validation after the final edit.
- `npm run ds:check:route -- home`: all four accessibility checks passed (WCAG scan, 320 px reflow, 200% text enlargement, forced colors/reduced motion).
- The visual comparison stage reports differences at all four widths. The tracked baselines show the older homepage with How it works, 1 Test = 1 Credit, and Why Test4Test sections, in addition to differing from this spacing change. Baselines were not updated.
- Inspected 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900. No document horizontal overflow at those widths.
- Full-page captures from the route checks are saved alongside these notes. Their trust cards use the repository's deterministic fixtures. Viewport captures use the current local homepage.

The screenshot comparisons are not a release-validation pass. This handoff is Fast-checked.
