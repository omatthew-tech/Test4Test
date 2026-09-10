# Home page spacious spacing

Tier 2 — Fast-checked.

Spacing changes are limited to the home page below the opening hero. The hero, first image, header, content, routes, and interactions are preserved. Existing semantic tokens supply every spacing value; no shared components or tokens changed.

## Spacing

| Relationship                                 | Mobile | Tablet | Desktop |
| -------------------------------------------- | ------ | ------ | ------- |
| Padding above and below each content section | 32 px  | 48 px  | 64 px   |
| Explicit gap between sections                | 64 px  | 64 px  | 64 px   |
| Gap between plain-section content groups     | 128 px | 160 px | 192 px  |
| Platform content to recruitment panel edge   | 128 px | 160 px | 192 px  |
| External margin above recruitment panel      | 32 px  | 48 px  | 64 px   |
| Major heading group to section content       | 40 px  | 48 px  | 48 px   |
| Gap between feedback feature rows            | 64 px  | 64 px  | 80 px   |
| Feedback image to text                       | 24 px  | 40 px  | 64 px   |

The selected spacious option adds an explicit 64 px gap between content sections. Desktop separation is 64 px bottom padding + 64 px gap + 64 px top padding. Mobile and tablet keep their existing responsive section padding, producing 128 px and 160 px separation respectively. A matching 64 px inset at the start of the content-section group applies the same rhythm after the trust strip without moving the hero or trust strip.

The recruitment panel retains its external margin so the white space to its visible blue edge matches the surrounding section rhythm. The panel keeps its existing internal padding. The closing divider retains its external margin in addition to the new grid gap. Heading-to-content spacing and the spacing within feedback rows remain as listed above; this pass implements the selected section-separation formula.

## Verification

- `npm run ds:check:fast -- src/pages/HomePage.module.css src/pages/HomePage.tsx` passed formatting, lint, TypeScript, and design-system validation.
- The spacious section-gap change passed `npm run ds:check:fast -- src/pages/HomePage.module.css`.
- `npm run ds:check:route -- home`: all four accessibility checks passed, covering WCAG A/AA, 320 px reflow, 200% text enlargement, forced colors, and reduced motion.
- The route's four screenshot comparisons differ from the tracked baselines. Those baselines show an older home page as well as different spacing. No baselines were updated; this is not a release-validation pass.
- Browser inspection at 390 × 844 and 1440 × 900 confirmed the revised layout and measured 128 px and 192 px gaps between plain-section content and above the blue recruitment panel. Additional measurements at 768 × 1024 confirmed 160 px gaps. No document horizontal overflow at these widths.
- Before/after DOM measurements at both required viewports matched for the hero and its contents: position, dimensions, padding, gaps, font styles, and background image. Transient feedback-quote animations were excluded from those measurements.

The [desktop capture](home-desktop.png) and [mobile capture](home-mobile.png) come from the route check and use deterministic trust-card fixtures. The [panel transition](panel-separation-desktop.png) shows the current local page at 1440 × 900.
