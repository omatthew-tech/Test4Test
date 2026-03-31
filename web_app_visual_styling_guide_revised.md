# Web App Visual Styling Guide

## Purpose
This guide defines the visual system for the entire product so the interface stays consistent across marketing pages, product flows, dashboards, forms, and feedback views.

This is a styling document first. It should guide color, typography, spacing, layout, surfaces, controls, illustration use, and overall visual behavior across the app.

The visual direction should feel clean, warm, and distinctive without looking sugary, overly branded, or trend-chasing. The creamsicle concept should give the product memorability, but the interface itself should remain restrained.

---

## 1. Visual character
The product should look:
- warm, not loud
- clean, not sterile
- playful in small moments, not cartoonish
- soft, not vague
- polished, not overly precious

The mascot system can carry personality. The interface should carry clarity.

The overall aesthetic should feel more like a well-made product with a recognizable signature than a “fun startup brand” trying too hard.

---

## 2. Brand color system
The palette should feel slightly sun-washed and food-inspired without becoming pastel candy branding. Orange remains the anchor. Raspberry is a supporting note, not a co-lead.

### Primary palette
**Creamsicle Orange**  
`#F58E56`

Use for:
- primary buttons
- active states
- key highlights
- focused accents
- selected chips and badges where emphasis is needed

**Soft Orange**  
`#FFD0AE`

Use for:
- hover fills
- subtle emphasis blocks
- selected backgrounds
- soft icon containers

**Milk Cream**  
`#FFF4EA`

Use for:
- warm section backgrounds
- subtle page tinting
- empty-state surfaces

### Secondary accent
**Raspberry Jam**  
`#C95774`

Use for:
- micro accents
- supportive tags
- occasional highlight moments
- secondary illustration details

Do not use raspberry as the default action color.

**Soft Raspberry**  
`#F4C1CD`

Use for:
- secondary chips
- light badges
- tiny decorative accents only

### Neutral palette
**Ink**  
`#1D1815`

**Graphite**  
`#4F4741`

**Dust**  
`#857B74`

**Fog**  
`#D8D0C8`

**Bone**  
`#F6F2EE`

**Paper**  
`#FFFEFC`

### Semantic colors
**Success** `#4E9D72`  
**Warning** `#E5A93D`  
**Error** `#C95B5B`

### Color distribution
Across most screens, keep the palette balanced like this:
- 65–75% paper, bone, or cream neutrals
- 15–20% ink and graphite structure
- 6–10% orange emphasis
- 1–3% raspberry detail

### Color rules
- Orange is the default signal for primary action.
- Raspberry should feel rare enough to stay memorable.
- Large color blocks should almost always be neutral.
- Avoid stacking multiple tinted backgrounds in one viewport.
- Avoid full-bleed bright orange sections unless used very intentionally.
- Never rely on raspberry alone to communicate meaning.

### Suggested tokens
```css
:root {
  --color-orange-500: #F58E56;
  --color-orange-200: #FFD0AE;
  --color-orange-050: #FFF4EA;

  --color-raspberry-500: #C95774;
  --color-raspberry-200: #F4C1CD;

  --color-ink-900: #1D1815;
  --color-ink-700: #4F4741;
  --color-ink-500: #857B74;
  --color-line-200: #D8D0C8;
  --color-surface-100: #F6F2EE;
  --color-surface-000: #FFFEFC;

  --color-success: #4E9D72;
  --color-warning: #E5A93D;
  --color-error: #C95B5B;
}
```

---

## 3. Typography
The type system should feel modern and calm with a little softness in the headline shapes.

### Recommended pairing
- **Headlines:** Sora
- **UI and body:** Inter

### Typography intent
- headlines should feel clean and confident
- body copy should feel neutral and easy to scan
- labels should feel crisp and quiet
- nothing should look overly geometric or too editorial

### Type scale
Use the visual rhythm of the system as the starting point, with practical exceptions where needed.

**Display / hero:** `64px`  
**Page title / H1:** `40px`  
**Section title / H2:** `24px`  
**Card title / H3:** `16px` or `18px` if readability needs it  
**Body:** `16px`  
**Small / labels:** `12px–14px`

### Font weights
- headline heavy moments: `600–700`
- section titles: `600`
- buttons and labels: `500–600`
- body text: `400–500`

### Line height
- large display text: `1.05–1.1`
- headings: `1.15–1.25`
- body: `1.5–1.65`
- labels: `1.3–1.4`

### Typography rules
- do not use more than two font families
- avoid all-caps body text
- avoid oversized paragraph widths
- avoid decorative fonts
- keep line lengths controlled for dashboard and form content

---

## 4. Spacing and sizing system
Use a simplified Fibonacci spacing scale as the main rhythm of the product. Keep the number of official values small so the system stays easy to apply.

### Core spacing scale
- `8px`
- `13px`
- `21px`
- `34px`
- `55px`
- `89px`

This should drive most spacing, padding, section rhythm, gap values, and major sizing decisions.

### Usage guidance
- `8px`: tight gaps, icon-to-label spacing, small internal alignment
- `13px`: compact control groups, dense UI clusters
- `21px`: default vertical rhythm inside forms, cards, and content blocks
- `34px`: card padding, medium group spacing, larger component gaps
- `55px`: standard section spacing
- `89px`: hero spacing and major layout separation

### Support values
Use these only when truly needed:
- `4px` for micro-adjustments
- `16px` for common control sizing or where an even value is important for implementation

These are support values, not the core rhythm.

### Spacing rules
- default to `21px` or `34px` for most component and content spacing
- use `55px` for most section spacing
- reserve `89px` for hero layouts or major page breaks
- icon-to-label spacing should usually be `8px`
- avoid introducing one-off values unless a component truly requires it
- do not mix more than 3 spacing steps inside a single component

### Suggested tokens
```css
:root {
  --space-1: 8px;
  --space-2: 13px;
  --space-3: 21px;
  --space-4: 34px;
  --space-5: 55px;
  --space-6: 89px;

  --space-xs: 4px;
  --space-even: 16px;
}
```

---

## 5. Layout system
The product should feel roomy but not wasteful. Layout should support quick scanning.

### Content width
- marketing and hero layouts: `1120–1200px` max width
- app content areas: `1200–1280px` max width
- text-heavy content: `640–720px` max width

### Grid behavior
- default to simple 12-column layouts on desktop
- prefer clean 2-column and 3-column arrangements over dense mixed grids
- dashboards should breathe; avoid overfilling rows with too many cards

### Section rhythm
- top-level sections: `55px` to `89px` vertical padding
- card groups: `21px` gaps
- dense UI groups: `13px` gaps

### Alignment rules
- align cards, controls, and copy blocks on the same grid whenever possible
- avoid visual centering when structural alignment would read cleaner
- keep left edges disciplined in dashboard and form screens

---

## 6. Radius system
Corners should feel soft and modern, not bubbly.

### Radius scale
- small controls: `8px`
- inputs and buttons: `16px`
- cards and drawers: `24px`
- feature panels or large hero containers: `40px` only when the design benefits from a softer statement

### Radius rules
- avoid mixing too many radius values in one viewport
- product UI should mostly live in the `16px` to `24px` range
- reserve large rounded containers for special moments, not every component

---

## 7. Surface system
The interface should rely on layering through value shifts, borders, and spacing rather than loud color.

### Surface hierarchy
**Page base:** Paper / Bone  
**Primary card surface:** Paper  
**Secondary softened surface:** Bone or Milk Cream  
**Selected surface:** Soft Orange or very light neutral tint

### Borders
Use thin warm dividers instead of sharp cool gray lines.

Default border:
```css
1px solid var(--color-line-200)
```

### Shadows
Shadows should be faint and close to the object. They should separate layers, not dramatize them.

Suggested shadow family:
```css
box-shadow: 0 6px 18px rgba(29, 24, 21, 0.06);
```

For hover or elevated states:
```css
box-shadow: 0 10px 28px rgba(29, 24, 21, 0.08);
```

### Surface rules
- do not rely on shadow alone; combine with border and spacing
- avoid hard black shadows
- avoid glassmorphism, neon glow, and aggressive blur treatments

---

## 8. Buttons and controls
Buttons should feel friendly and substantial, not flashy.

### Primary button
- fill: Creamsicle Orange
- text: Ink
- radius: `16px`
- horizontal padding: usually `24px`
- vertical padding: usually `16px`
- optional subtle shadow

### Primary hover
- slightly deepen orange or raise contrast subtly
- no dramatic movement

### Secondary button
- surface: Paper
- text: Ink
- border: warm neutral line
- same height and radius family as primary

### Tertiary / ghost
- transparent or very light neutral fill
- use sparingly
- should not visually compete with the primary action

### Input fields
- height should feel generous and readable
- surface: Paper
- border: warm neutral line
- radius: `16px`
- internal horizontal padding: `16px`
- focus ring: orange-tinted, clean, and visible

### Chips / pills / tags
- default: Bone or Milk Cream with Ink text
- orange: for active or selected states
- raspberry: for occasional metadata or emphasis only

---

## 9. Iconography
Icons should be minimal, rounded, and slightly softened.

### Rules
- use one icon family consistently
- avoid highly detailed or sharp technical icons
- default sizes should usually be `16px`, `20px`, or `24px`
- pair icons with text rather than relying on them alone in key flows

### Style direction
Think clean utility icons with a slight friendliness, not enterprise admin symbols.

---

## 10. Illustration and mascot use
Illustration should support the product without taking over the interface.

### Mascot system
- the **orange creamsicle smiley** is the primary brand mark
- the **raspberry creamsicle smiley** is a secondary accent character
- the raspberry variant should appear less often and never overpower the orange mascot in core brand placements

### Illustration style
- flat vector or near-flat vector
- rounded edges
- simple geometry
- minimal facial detail
- little to no outline weight
- no detailed scenes
- no glossy rendering

### Where mascot use makes sense
- empty states
- onboarding moments
- social assets
- light success states
- marketing illustrations

### Where mascot use should be limited
- dense dashboard views
- long forms
- analytics-heavy screens
- repeated card lists

### Illustration rule
The mascot is a signature, not the main interface language.

---

## 11. Motion and interaction tone
Motion should feel soft, quick, and useful.

### Rules
- use small transitions, not theatrical animation
- hover should feel responsive, not bouncy
- use fades, slight lifts, and subtle scale shifts only where they help clarity
- keep durations short and calm

### Suggested motion range
- micro transitions: `120–180ms`
- panel and modal transitions: `180–240ms`

### Avoid
- springy overshoot everywhere
- floating elements that constantly move
- novelty animations in core workflows

---

## 12. Styling rules by interface area
### Marketing pages
- slightly warmer and more open
- more use of cream backgrounds and soft illustration moments
- stronger orange presence around CTA zones

### Core app screens
- more neutral overall
- less illustration
- more disciplined spacing and surface hierarchy
- orange should appear mainly in actions, focus, and selected states

### Dashboard / results views
- keep charts and summaries clean and neutral
- use color to clarify, not decorate
- avoid stacking too many badges, tints, and dividers

### Forms and wizards
- large enough click targets
- strong spacing rhythm
- minimal decoration
- extremely clear active and completed states

---

## 13. Accessibility guardrails
The palette is soft, so contrast must stay deliberate.

### Rules
- body text should almost always use Ink or Graphite
- orange backgrounds need tested text contrast
- pale backgrounds must always pair with dark text
- raspberry should never be the sole indicator of state
- focus states must remain obvious on every interactive element

---

## 14. Design constraints
These should stay consistent across the whole app.

1. The interface should read as product-first, mascot-second.
2. Orange is the anchor color.
3. Raspberry is an accent, not a second primary.
4. Surfaces should stay light, warm, and quiet.
5. Use the simplified Fibonacci spacing system of `8, 13, 21, 34, 55, 89` as the main layout rhythm.
6. Prefer a small set of reusable values over custom one-off styling.
7. Rounded corners should feel soft, but never toy-like.
8. Decorative styling should never interfere with comprehension.

---

## 15. Short implementation brief
Build a visual system that feels warm, minimal, and recognizable. Use soft neutrals for most surfaces, creamsicle orange for primary action and focus, raspberry only in small accent moments, Sora for headlines, Inter for UI and body text, warm dividers instead of sharp gray lines, light shadows, `16px–24px` radii for most controls and cards, and a simplified Fibonacci spacing rhythm of `8, 13, 21, 34, 55, 89` for most layout decisions. The result should feel polished and specific to this brand without looking overly cute, templated, or synthetic.
