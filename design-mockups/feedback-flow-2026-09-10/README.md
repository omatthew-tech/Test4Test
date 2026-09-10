# Smaller illustrations and smoother section flow

Three image explorations of the homepage feedback section. Application code and visual baselines are unchanged.

## Observations

The existing section measures about 1,189 px tall at a 1440 × 900 viewport. Each illustration is about 568 × 444 px. The previous section uses a three-column layout, while this section switches to two tall alternating rows. The large introductory gap, change of reading direction, and dark second illustration likely contribute to the perceived interruption in flow.

The existing mobile layout was also inspected at 390 × 844; the section is about 1,096 px tall with illustrations about 343 × 268 px.

## Variations

1. **[Side-by-side options](01-side-by-side.png)** — both methods visible together; smaller illustrations above their corresponding copy and action. Maintains the column rhythm of the preceding section.
2. **[Aligned rows](02-aligned-rows.png)** — copy stays on the left, with small illustrations on the right. Recommended starting point: preserves a sequential explanation and makes the reading path consistent.
3. **[Heading beside the options](03-heading-beside-options.png)** — heading at left, two small image-and-copy rows at right. A more compact, asymmetric arrangement.

All prompts preserve the struck-through word “paid”, both method headings, descriptions, buttons, and both complete illustrations including their text. Generated mockups are visual concepts, not browser-rendered implementations or release validation.

All three outputs were visually inspected for the heading, method titles, complete descriptions, action labels, and illustration text. Main copy and both illustrations remain present. Image generation approximates the source artwork and design tokens; exact layout dimensions are implementation guidance, not measured output guarantees.

## Source and generation

- Source: `../feedback-background-options/original-section.png`, checked against current `src/pages/HomePage.tsx` and the rendered homepage.
- Generator: built-in image generation tool.
- Exact prompts: [generation-prompts.md](generation-prompts.md).
