# Test4Test Design System

## 1. Purpose and scope

This system is the implementation contract Codex will use when redesigning **Test4Test**. It is intended to help Codex understand the interface model, generate valid UI, reuse components, apply accessibility requirements, and make changes that can be validated and audited.

**Initial visual brief:** Light, generous white space, framed compositions, rounded edges, simple, and slightly innovative.

### Proposed principles

1. **Structured over inferred.** Tokens, components, states, and constraints must be explicit and machine-readable.
2. **Accessible by default.** Accessibility semantics and interaction behavior are part of each component contract.
3. **Familiar foundations, deliberate expression.** Use the strongest contemporary web conventions as a baseline, then differentiate in a few controlled areas.
4. **Composable, not arbitrary.** Agents may assemble only documented components and allowed patterns.
5. **Safe and auditable.** State-changing actions require visible intent, feedback, provenance, and appropriate confirmation.
6. **Responsive from one token family.** Desktop and mobile share a common system with contextual values rather than separate visual languages.

## 2. Visual direction

### Confirmed direction: light, structured, and quietly innovative

The Test4Test visual language is light, clean, minimal, structured, polished, modern, and approachable. It uses generous white space, framed compositions, rounded edges, simple hierarchy, restrained elevation, and carefully selected details that feel slightly innovative without becoming visually loud.

Innovation should appear through small compositional surprises, thoughtful product demonstrations, subtle color or motion, and highly polished interaction feedback. The system avoids bold, energetic, playful, and corporate expression. It should never rely on oversized spectacle, aggressive color, novelty decoration, or institutional formality. The prohibited visual and interaction patterns below define how the system avoids generic AI-generated styling.

### Brand qualities

- **Convey:** light, spacious, framed, rounded, simple, slightly innovative, clean, minimal, structured, polished, modern, and approachable.
- **Avoid:** bold, energetic, playful, and corporate.

Also, avoid the following unless the human requests to do something specifically that would conflict with any of these, in that case, confirm with the human:

#### Overall composition

- Dark navy background + purple/cyan mesh gradient + blurred glow orbs.
- Frosted-glass cards + 1 px white borders + large radii + diffuse glow.
- Centered SaaS hero with eyebrow chip, huge headline, gradient word, two pill CTAs, floating dashboard mockup, and logo wall.
- A bento grid used as the default answer to every content problem.
- Untouched neutral-sans typography with no recognizable brand voice.
- Sparkle, wand, brain, bot, stars, and orbit icons as generic decoration.
- A fake dashboard where every KPI rises and every chart looks healthy.
- Generic glossy 3D blobs, chrome objects, faceless clay people, or floating UI fragments that do not explain the product.
- Fade-up animation on every section and hover-lift on every card.
- Only the pristine "happy path": no empty, error, loading, long-content, permission, offline, or destructive-action states.

#### Color and decorative effects

- Purple merely because the product mentions AI.
- Electric blue/purple gradients applied to background, text, buttons, borders, icons, and charts simultaneously.
- Gradient text on every headline or emphasized noun.
- Rainbow mesh gradients with no relationship to content.
- Dark mode used as a substitute for art direction.
- Random neon glows behind cards, devices, logos, and CTAs.
- Blurred blobs positioned in page corners as automatic visual filler.
- Grain/noise overlays added to every surface to simulate "human texture."
- Liquid-glass or chrome treatments copied onto ordinary controls.
- Transparent controls over busy imagery or moving backgrounds.
- Different decorative styles in each section: wireframe, clay, glass, hand-drawn, photoreal, and pixel art on one page.
- Generic circuit traces, node networks, grids, particles, and star fields used to signal "technology."
- Decorative color with no semantic discipline.
- Every status rendered as a bright colored pill.
- Palette choices that collapse under color-vision deficiencies.

#### Typography

- One giant 72-112 px headline followed by nearly uniform small text.
- Every heading set in 700-900 weight.
- Centered body copy longer than two or three short lines.
- Uppercase eyebrow labels with wide tracking above every heading.
- A monospace font on arbitrary labels solely to look technical.
- Low-contrast gray body text on white, black, glass, or gradient surfaces.
- Forced line breaks that create awkward headline shapes at common widths.
- Widows, one-word lines, and isolated punctuation caused by fixed widths.
- Nearly identical font sizes that fail to establish hierarchy.
- Too many font sizes, weights, and line heights generated ad hoc.
- Tight tracking on heavy, oversized headings until letters collide.
- Oversized numbers without units, period, source, or context.
- Inconsistent title case, sentence case, and all caps in peer components.

#### Layout and grouping

- Cardifying every paragraph, metric, quote, setting, and navigation item.
- Cards nested inside cards inside a rounded page container.
- Every section enclosed in the same large rounded rectangle.
- Perfectly symmetrical layouts regardless of content priority.
- Huge empty areas that conceal a lack of content strategy.
- Repetitive left-text/right-image, then right-text/left-image sections.
- Three equal feature cards when one feature is clearly primary.
- A bento grid whose box sizes appear arbitrary.
- Floating cards that overlap the hero image without a spatial reason.
- Fake browser chrome around every screenshot.
- A full-viewport hero that delays all concrete information.
- Logo walls with inconsistent logo sizes, invented brands, or no explanation.
- Repeated icon + title + one-sentence blocks with identical proportions.
- Arbitrary section max-width changes that break shared alignment lines.
- Dividers, borders, and background changes between every section.
- Marketing-site spacing transplanted into a dense operational web app.
- Dashboard density transplanted into a marketing page as decoration.

#### Components and interaction states

- The same 16-24 px corner radius on buttons, cards, dialogs, inputs, tooltips, tables, charts, and images.
- Pill-shaped treatment for every button, tab, input, badge, and filter.
- A 1 px translucent border around every object.
- Large diffuse shadows beneath all cards.
- Every icon placed in a tinted rounded square.
- Mixed icon families, stroke widths, cap styles, corner styles, and optical sizes.
- A recognizable component library left visually untouched.
- Badges and chips added as filler beside ordinary labels.
- Every card moving upward, scaling, glowing, and changing shadow on hover.
- Primary, secondary, tertiary, and destructive buttons with similar weight.
- Uncommon actions represented by icon-only buttons.
- Enabled, hovered, focused, pressed, disabled, selected, and loading states distinguished only by small opacity changes.
- Missing keyboard focus because the default outline was removed.
- Skeleton loaders whose geometry does not match the loaded content.
- Generic toggles where a checkbox, radio group, or button would be clearer.
- Floating action buttons copied into desktop layouts without a dominant action.
- Excessive tooltips used to compensate for unclear icons and labels.

#### Data and sample content

- Charts without titles, units, axes, time ranges, legends, or source context.
- Every line chart moving smoothly upward and to the right.
- Random chart types chosen for visual variety rather than the question.
- Data colors that do not match labels, legends, statuses, or prior screens.
- Tiny dashboards inside hero images that no one can read.
- Perfect round sample values such as 10,000, 50%, $1M, and 99.9% everywhere.
- KPIs with no period, comparison, denominator, or definition.
- Percentages, category totals, or chart segments that do not reconcile.
- Tables whose names, dates, values, and row lengths all look artificially uniform.
- Inconsistent currencies, date formats, time zones, decimal precision, and units.
- Activity feeds where every event is recent, positive, and evenly spaced.
- Green online dots, unread badges, and notification counts scattered everywhere.
- Controls that do not correspond to the data shown beneath them.
- A pristine dashboard with no empty, partial, stale, delayed, failed, or permission-restricted data.

#### Motion

- Fade-and-slide entrance animation on every visible element.
- Staggered card reveals used on routine lists and tables.
- Infinite logo marquees used as social-proof wallpaper.
- Animated aurora backgrounds, gradient waves, particles, or floating orbs.
- Cursor-following spotlights and glows.
- Magnetic buttons or controls that move away from their documented position.
- 3D card tilt on ordinary content.
- Count-up animations on every statistic.
- Shimmer effects that continue after loading or appear on decorative surfaces.
- Scroll hijacking, pinned scenes, or parallax on task-oriented pages.
- "transition: all" behavior that animates dimensions, layout, and focus unpredictably.
- The same duration and easing for every component and distance.
- Decorative motion with no reduced-motion alternative.
- Glass controls over animated or high-frequency backgrounds.

#### Responsive behavior

- A desktop grid simply stacked into one endless column.
- Giant hero typography that consumes most of a phone viewport.
- A desktop dashboard scaled down until labels become unreadable.
- Fixed-height cards that clip translated, zoomed, or user-generated text.
- Horizontal overflow caused by glows, transforms, code blocks, charts, or absolutely positioned decoration.
- Desktop-sized page gutters on small screens.
- Buttons whose labels wrap into inconsistent two-line pills.
- Tables squeezed into unreadable columns.
- Modals that remain desktop-sized and centered on phones.
- Sticky headers, cookie banners, chat launchers, and bottom bars that overlap controls or keyboard focus.
- Safe-area insets ignored on notched or rounded-screen devices.
- Hover-only menus, explanations, or actions.
- Tiny icon controls packed closely because the desktop version looked clean.
- Breakpoints chosen only where the generator's preview happened to look good.
- Large empty gaps left by hidden decorative elements.

#### Accessibility

- Light gray text on white or translucent surfaces.
- Text placed directly over detailed photography or gradients.
- Gradient-filled text whose weakest section becomes unreadable.
- Status communicated by red/green or hue alone.
- Links visually indistinguishable from surrounding text.
- Focus indicators removed, clipped, hidden under overlays, or visible only against one background.
- Placeholder-only form labeling or placeholder text visually styled as a permanent form label.
- Errors represented only by a red border.
- Thin text and hairline icons used to create a fragile "premium" look.
- Charts distinguished only through similar hues.
- Controls that are visually tiny even when invisible padding enlarges the hit area.
- Zoom or text resizing that clips, overlaps, or hides content.
- Decorative animation that competes with reading or task completion.
- Disabled controls so faint that their label or purpose disappears.

#### Cross-interface consistency

- Arbitrary spacing values that produce almost-but-not-quite rhythm.
- Corner radii drifting between visually equivalent components.
- Button, input, select, and tab heights differing by a few pixels.
- Icons with inconsistent apparent size despite identical numeric dimensions.
- Shadows with inconsistent direction, blur, spread, or implied light source.
- One-pixel alignment errors between headings, cards, tables, and controls.
- Mixed border colors and opacities on peer surfaces.
- Inconsistent line heights and baseline alignment in repeated rows.
- Image aspect ratios changing arbitrarily across a repeated set.
- Different empty-state illustration styles across the application.
- Skeleton, empty, error, and loaded states that shift the layout dramatically.
- Badges colliding with text, corners, scrollbars, or responsive crops.
- Component variants that look similar but behave differently.
- Long names, URLs, IDs, translations, and numbers overflowing their containers.
- A polished landing page paired with visibly default auth, settings, billing, help, and error screens.

## 3. Color

### Confirmed architecture

- **Canvas:** pure white (`#FFFFFF`).
- **Subtle surface:** pale blue-gray for grouped content.
- **Raised surface:** white with a thin border and restrained shadow.
- **Primary text:** cool charcoal (`#242A31`).
- **Secondary text:** cool mid-gray with accessible contrast.
- **Primary accent:** Aegean blue–cyan (`#007BAE`).
- **Supporting accent:** Aegean tint (`#E1F6FF`), used for focus, selection, and subtle innovative details.
- **Semantic colors:** success green, warning amber, danger red, and information blue; never conveyed by color alone.
- **Section treatment:** light surfaces only; high-contrast dark sections are outside the visual language.

The palette is authored as perceptually even OKLCH relationships and delivered with tested sRGB values. Filled primary actions retain at least 4.5:1 contrast with white text; meaningful boundaries and focus indicators retain at least 3:1 contrast against adjacent surfaces.

### Fixed Aegean ramp

The three approved values remain unchanged: Aegean 50 is the selected tint, Aegean 600 is the primary action, and Aegean 700 is the hover/pressed state. The surrounding steps follow perceptually even changes in lightness and chroma.

| Step | Value | Primary use |
|---:|---|---|
| 50 | `#E1F6FF` | Selected tint, information surface |
| 100 | `#CAEAFA` | Subtle accent surface |
| 200 | `#A0D7F4` | Decorative accent boundary |
| 300 | `#74BFE8` | Illustration and data visualization |
| 400 | `#4DA6D6` | Low-emphasis graphic accent |
| 500 | `#2890C4` | Secondary interactive accent |
| 600 | `#007BAE` | Primary action and focus ring |
| 700 | `#006799` | Hover and pressed action |
| 800 | `#02547F` | Strong accent text and icons |
| 900 | `#073E5F` | Maximum-emphasis accent details |
| 950 | `#0A293F` | Rare high-contrast accent detail |

### Fixed cool-neutral ramp

| Step | Value | Primary use |
|---:|---|---|
| 0 | `#FFFFFF` | Canvas and primary surface |
| 25 | `#FBFDFE` | Barely tinted surface |
| 50 | `#F4F7F9` | Grouped and inset surface |
| 100 | `#EBEFF2` | Subtle divider and disabled fill |
| 200 | `#D9DFE3` | Default border |
| 300 | `#C1C9CE` | Stronger divider |
| 400 | `#9DA6AD` | Disabled content |
| 500 | `#7D8890` | Strong boundary and placeholder |
| 600 | `#606B72` | Tertiary text |
| 700 | `#4A545C` | Secondary text |
| 800 | `#353D44` | Strong secondary content |
| 900 | `#242A31` | Primary text |
| 950 | `#161B20` | Maximum-emphasis text and icons |

### Fixed semantic families

Semantic colors are intentionally muted enough to coexist with Aegean. They use color plus text or iconography, never color alone.

| Role | Tint | Primary | Hover/pressed | Content pairing |
|---|---|---|---|---|
| Success | `#E8F7EF` | `#247A52` | `#1B6542` | White on primary; charcoal on tint |
| Warning | `#FFF4D6` | `#976300` | `#7C5000` | White on primary; charcoal on tint |
| Danger | `#FDECEF` | `#B83A4B` | `#982C3C` | White on primary; charcoal on tint |
| Information | `#E1F6FF` | `#007BAE` | `#006799` | White on primary; charcoal on tint |

### Provisional token roles

The canonical system will use semantic roles rather than raw color names in components:

`color.background.canvas`  
`color.background.subtle`  
`color.surface.default`  
`color.surface.raised`  
`color.text.primary`  
`color.text.secondary`  
`color.border.default`  
`color.border.strong`  
`color.action.primary`  
`color.action.primary-hover`  
`color.focus.ring`  
`color.status.success|warning|danger|info`

High-contrast accessibility overrides and data-visualization palettes resolve through semantic roles rather than direct component overrides.

## 4. Typography

### Confirmed family architecture

Use **Geist Variable** for all Test4Test interface text, body copy, labels, headings, marketing headlines, and display text. Use **Geist Mono Variable** only for code, identifiers, test IDs, technical values, logs, and agent/tool output. No contrasting display typeface is used.

The web implementation should self-host optimized WOFF2 variable files and use explicit fallback stacks:

- UI and content: `"Geist", "Inter", system-ui, sans-serif`
- Technical content: `"Geist Mono", "SFMono-Regular", Consolas, monospace`

The supported weights are:

- **400:** body copy and routine interface content
- **500:** labels, navigation, controls, and moderate emphasis
- **600:** headings and strong emphasis
- **700:** rare high-emphasis use only

Typography uses balanced density in the web application and slightly more spacious composition on marketing pages. The system supports extended Latin-script languages initially. If Test4Test expands into other writing systems, script-specific Noto fallbacks and native-language typography review must be added deliberately.

### Confirmed responsive type scale

| Role | Mobile size/line height | Desktop size/line height | Default weight |
|---|---:|---:|---:|
| Caption | 12/16 px | 12/16 px | 400 or 500 |
| Interface | 14/20 px | 14/20 px | 500 |
| Body | 16/24 px | 16/24 px | 400 |
| Lead | 18/28 px | 20/30 px | 400 |
| Small heading | 24/30 px | 24/30 px | 600 |
| Medium heading | 28/34 px | 32/38 px | 600 |
| Large heading | 32/38 px | 40/46 px | 600 |
| Hero | 40/44 px | 56/60 px | 600 |
| Display | 48/52 px | 64/68 px | 600 |

Body measure should normally remain between 55 and 75 characters per line. Use sentence case throughout and avoid routine all-caps styling. Use tabular numerals for tables, metrics, and aligned values. Geist Mono is reserved for identifiers and technical output. Interfaces must remain usable when users enlarge text or override text spacing.

## 5. Spacing and sizing

### Confirmed spacing scale

Use a 4 px foundation with an 8 px primary rhythm:

`0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`

Optical exceptions are limited to `2, 6, 10, 14, 30` and must be justified by a documented component need rather than used for general layout. Values `96` and `128` are optional macro-layout extensions and may be used only when the 80 px maximum is insufficient for large page composition. Components should reference semantic spacing aliases such as `space.inline.sm` or `space.stack.lg`, not raw values.

### Confirmed control and layout sizing

- Compact: 40 px
- Default: 44 px
- Large: 48 px
- Minimum interactive target: 44 × 44 px
- Card padding: 20 px mobile and 24 px desktop
- Form-field gap: 16 px
- Standard content stack: 24 px
- Section spacing: 48 px mobile and 64 or 80 px desktop
- Page gutters: 16 px mobile, 24 px tablet, and 32–48 px desktop

Mobile uses the same token family, concentrating on 12, 16, 20, and 24 px component padding and reducing large section intervals. There is no global dense mode; compact controls are limited to tables, toolbars, and similarly constrained interfaces.

## 6. Layout and responsive behavior

### Confirmed layout model

- Full-width page shell with a centered content container.
- Default desktop content width: 1280 px.
- Semantic subcontainers: 288 px compact lead-capture forms, 720 px prose, 640 px standard forms, 960 px data-focused content, and 1280 px full layouts.
- Responsive side gutters: 16 px mobile, 24 px tablet, 32–48 px desktop.
- Grid: 4 columns mobile, 8 columns tablet, and 12 columns desktop.
- Use CSS Grid for page and two-dimensional layouts; Flexbox for one-dimensional component alignment.
- Prefer intrinsic layouts with `min()`, `max()`, `clamp()`, wrapping, and container queries where appropriate.
- The authenticated application uses top navigation on desktop, not a sidebar, and the compact, non-modal `TopNavigation` disclosure on mobile, as defined in the [application-shell pattern](patterns/application-shell.md). `MobileNavigationDrawer` remains available for explicitly selected modal compositions.
- Horizontal page scrolling is prohibited at supported viewport sizes.

### Provisional responsive tiers

- Small: below 768 px
- Medium: 768–1023 px
- Large: 1024–1439 px
- Extra large: 1440 px and above

Components should define behavioral changes by available space, not only by device labels. Hero layout may be left-aligned with adjacent product media or centered with media below; both are approved patterns when selected intentionally.

The default marketing hero is left-aligned. A centered hero is permitted when the message and CTA are the sole focus. Bento grids are allowed for concise feature summaries but are not a default applied across the whole site.

## 7. Shape, borders, and elevation

### Confirmed shape scale

- 4 px: tiny indicators and tightly constrained elements
- 6 px: badges and compact tags
- 8 px: buttons, inputs, and standard controls
- 12 px: menus, popovers, and compact cards
- 16 px: standard cards and framed panels
- 24 px: hero media, large product frames, and expressive containers
- Fully rounded: avatars, status dots, chips, and appropriate pill controls

### Confirmed borders, focus, and elevation

- Default card and frame border: 1 px cool neutral 200 (`#D9DFE3`).
- Subtle divider: 1 px cool neutral 100 (`#EBEFF2`).
- Focus indicator: 2 px Aegean 600 (`#007BAE`) with a 2 px offset.
- Cards use borders without shadows unless they are raised, floating, sticky, or overlapping.
- Subtle elevation uses low-opacity shadows tinted from cool neutral 950 (`#161B20`).
- Stronger elevation is reserved for menus, popovers, drawers, and dialogs.
- Glow effects, heavy decorative shadows, and excessive pill-shaped containers are prohibited.

## 8. Motion and feedback

### Confirmed motion principles

Motion explains cause and effect, preserves spatial context, and confirms state changes. It must not delay routine tasks.

- Fast feedback: 120 ms
- Standard transition: 200 ms
- Deliberate transition: 320 ms
- Movement distance: normally 2–8 px.
- Entrances use restrained opacity, color, border, and short spatial movement.
- Easing is smooth and natural; bounce and elastic effects are prohibited.
- Hover feedback changes color or border rather than scaling the element.
- Loading states prefer determinate progress when duration is knowable and skeletons when structure is stable.
- Success feedback uses a subtle check, status message, or toast; celebratory confetti is prohibited.
- Animated gradients, parallax, autoplay, and looping decorative motion are prohibited.
- Reduced-motion behavior is required and removes nonessential movement and skeleton shimmer.
- Long operations provide visible progress plus appropriate stop, retry, and recovery controls.
- Destructive actions animate only after confirmation and never imply completion before the operation succeeds.

## 9. Imagery, illustration, icons, and data visualization

### Confirmed direction

- Product UI is shown through authentic Test4Test screenshots and focused interface compositions rather than generic device mockups.
- Screenshots appear in white frames with 16–24 px radii, cool-neutral borders, and restrained elevation.
- People photography and stock photography are outside the visual language.
- Illustration is limited to simple geometric or line-based vectors using Aegean and cool neutrals when a concept cannot be communicated with product UI alone.
- Cartoon styling, glossy 3D objects, generic technology imagery, decorative AI-brain graphics, and busy collages are prohibited.
- Lucide is the standard icon family. Icons use the outlined style at 16, 20, or 24 px with a consistent 2 px stroke. Filled variants are reserved for selected states and essential status communication.
- Generative imagery is not part of the core system and requires explicit approval for any future use.
- A dedicated categorical chart palette is not required. If data visualization is introduced later, it must use semantic roles, accessible contrast, and labels or shapes in addition to color.

## 10. Content and voice

### Confirmed principles

- Clear, calm, approachable, precise, and helpful.
- Avoid corporate language, hype, cuteness, unnecessary technical jargon, and robotic phrasing.
- Use plain English, active voice, and approximately an eighth-grade reading level unless technical precision requires otherwise.
- Use sentence case throughout. Natural contractions are allowed.
- Controls begin with clear verbs and labels are normally one to three words.
- Instructions explain the outcome rather than narrating interface mechanics.
- Success messages confirm the completed result without celebration or exclamation marks.
- Destructive actions name the affected object and consequence.
- State what the system or agent is doing before technical detail.
- Avoid anthropomorphic claims that obscure system limitations.
- Separate facts, model inferences, recommendations, and user decisions.
- Errors explain what happened, what remains safe, and the next action.

## 11. Accessibility and inclusive design

### Confirmed baseline

- WCAG 2.2 AA is the release standard; pursue AAA contrast and focus guidance where it does not compromise usability.
- Use semantic HTML before adding ARIA.
- Every interactive component contract defines role, accessible-name rules, states, keyboard behavior, focus behavior, and target size.
- Every action is operable by keyboard alone.
- Focus uses the confirmed 2 px Aegean ring with a 2 px offset and is never represented by color change alone.
- Interactive targets are at least 44 × 44 px.
- Color, animation, audio, and spatial position are never the only carriers of meaning.
- Interfaces support 200% text enlargement and reflow at 320 CSS px without loss of content or functionality.
- Forms provide persistent labels, field-level errors, an error summary, and recovery instructions.
- Dynamic updates use appropriate live-region behavior without excessive announcements.
- Audio and video include captions; prerecorded spoken content also includes transcripts.
- Reduced motion, operating-system forced colors, and increased-contrast settings are included in acceptance criteria.
- Manual testing covers keyboard-only navigation, NVDA with Chrome, and VoiceOver with Safari.
- Automated accessibility checks run in CI and supplement rather than replace manual testing.
- Agent-generated interfaces must pass the same automated and human checks as human-authored interfaces.

## 12. Component model and initial library

### Confirmed component families

1. **Actions:** button, icon button, link.
2. **Inputs:** text field, textarea, select, combobox, checkbox, radio, switch.
3. **Navigation:** top navigation, mobile navigation drawer, tabs, breadcrumb, pagination, and menu.
4. **Feedback:** alert, toast, inline validation, progress, skeleton, empty state.
5. **Overlays:** dialog, drawer, popover, tooltip, menu.
6. **Data display:** card, table, list, badge, status indicator, and code/technical value.
7. **Layout:** container, stack, cluster, grid, divider, section, bento grid.

The canonical contract remains framework-agnostic. The production implementation is **React with TypeScript**, using typed props and accessible HTML semantics. React bindings may not weaken or omit canonical contract requirements.

### Architecture decisions and alternatives

The adopted runtime is recorded in [decision 0002](decisions/0002-runtime-architecture.md). The following comparison is a current maintenance assessment for owner approval. The historical adoption records establish the chosen architecture; they contain no recorded alternatives evaluation.

| Decision | Reason to retain the current approach | Alternative and trade-off | Reconsider when |
|---|---|---|---|
| Repository-local React/TypeScript components with explicit contracts | Existing application consumers, semantic tokens, keyboard contracts, and stories share one maintained public API. Retaining it preserves established behavior while scoped changes are reviewed. | Wrapping maintained accessibility primitives could supply some interaction behavior, but still requires mapping Test4Test tokens, props, states, and tests. Replacing stable components adds migration work and requires owner approval. | A concrete unsupported interaction or repeated accessibility defect justifies evaluating a replacement. |
| Repository-owned DTCG tokens with generated runtime and Figma outputs | Source tokens and deterministic generation keep code review, validation, CSS, and TypeScript tied to the same values. Figma remains a downstream consumer. | Authoring tokens in a design tool would require a defined synchronization and conflict policy. The current Figma export also omits shadows and easing curves unsupported by its native importer. | A demonstrated design-team workflow requires upstream authoring and an approved synchronization contract. |
| Internal distribution through one public barrel | The current system serves this repository, so components and consuming routes can change together under repository checks. | A separately published package would support independently versioned consumers, while adding package-release coordination and compatibility work. | A second independently versioned consumer creates a concrete distribution requirement. |

The local component approach retains responsibility for keyboard behavior, accessibility, contracts, and regression evidence within Test4Test. Approval of this comparison records the owner's rationale for continued maintenance; it does not establish that these options were considered before adoption.

## 13. Codex implementation behavior and safety

### Confirmed rules

- Codex must consult this design system before creating or changing Test4Test UI.
- Existing components and semantic tokens must be reused whenever they satisfy the requirement.
- Raw colors, spacing, typography, radii, shadows, and breakpoints may not be invented.
- Codex may create a component only when no existing component or composition adequately fits, and must notify the human in chat.
- A new component includes its typed React implementation, machine-readable contract, accessibility behavior, examples, and tests in the same change.
- Design tokens, foundational rules, component dependencies, and UI libraries may change only with explicit approval.
- User changes and established behavior are preserved unless the task explicitly changes them.
- Destructive or difficult-to-reverse changes require confirmation.
- Follow the risk tiers in [AGENTS.md](../AGENTS.md) and the [validation lanes](README.md#validation-lanes): fast checks for Tier 0–1, targeted checks for Tier 2 and iteration, and complete validation for Tier 3 and the other finalization conditions listed in AGENTS.md.
- Inspect changed layouts at 390 × 844 and 1440 × 900 when layout can reflow. Tier 3 work follows the complete viewport and release requirements in the [repository design-system skill](../.agents/skills/test4test-design-system/SKILL.md).
- Exceptions are documented and do not silently become new conventions.

## 14. Tokens and machine-readable artifacts

### Confirmed canonical stack

- DTCG-compatible JSON for design tokens and aliases.
- JSON Schema for component contracts.
- The repository is the authoritative source of truth.
- Generated CSS custom properties and typed TypeScript exports are the web runtime outputs.
- Generated files are never edited manually.
- Figma is optional. If introduced, it receives values from the repository and does not become a competing source of truth.

Token names use semantic layers:

1. **Primitive:** raw palette, size, duration, font, and radius values.
2. **Semantic:** purpose-based roles such as `color.text.primary`.
3. **Component:** narrow aliases such as `button.primary.background.default`, created only when semantic tokens are insufficient.

React components consume semantic or component tokens and never primitive tokens directly. Token names describe purpose rather than appearance. Alias references, unique IDs, allowed raw values, and generated-file integrity are validated during the build. Invalid references, duplicate IDs, unsupported raw values, or manual changes to generated outputs fail validation. Token and schema changes are versioned and recorded in a changelog.

Initial generated artifacts are:

- `tokens.css`
- `tokens.ts`
- DTCG token JSON
- Component-contract JSON Schemas
- Machine-readable component catalog

## 15. Documentation, tooling, and agent access

### Confirmed delivery model

- Canonical documentation lives in the Test4Test repository under `design-system/`.
- The documentation structure contains `README.md`, `foundations/`, `tokens/`, `components/`, `patterns/`, `contracts/`, `decisions/`, `examples/`, and `visual-baselines/`.
- Each component keeps its human guide, contract, examples, tests, and visual baseline close together.
- Storybook provides interactive React component documentation, states, examples, and accessibility checks.
- A local Test4Test design-system Skill packages repeatable Codex workflows for component creation, conformance review, legacy migration, and accessibility auditing.
- Standard commands include `npm run ds:validate`, `npm run ds:a11y`, `npm run ds:visual`, and `npm run ds:check`.
- Desktop and mobile screenshot baselines support visual regression testing.
- Meaningful design changes receive short decision records.

## 16. Governance, validation, and release

### Confirmed baseline

- The user is the final design-system owner and approver. Codex implements scoped changes and may propose, but not approve, foundational or breaking changes.
- Stable IDs and semantic versioning apply to tokens, components, schemas, and published artifacts.
- Lifecycle states are experimental, beta, stable, and deprecated.
- Patch releases contain compatible fixes and documentation; minor releases add compatible components, variants, or tokens; major releases contain breaking contracts, renamed tokens, or changed behavior.
- Releases occur on demand after all gates pass.
- Stable deprecations remain available for at least two minor releases and 90 days.
- Required gates are token and schema validation; formatting, lint, and TypeScript checks; unit and interaction tests; automated accessibility checks; manual keyboard review; desktop and mobile visual comparison; successful production build; and updated documentation and changelog.
- Accessibility failures, build failures, schema errors, broken tests, and unexplained visual regressions block release.
- Exceptions require a decision record with rationale, owner, scope, and expiration date.
- Provenance records source paths, commit, author or agent, generation method, and timestamp.
- Publishing and breaking migrations require explicit user approval.
- Releases are tagged, traceable, and reversible to a prior version.

### Risk boundaries and limits

This specification governs interface foundations, component behavior, and design-system validation. The [recording-first product specification](../usability_platform_product_plan.md) and [decision 0005](decisions/0005-recording-first-product-model.md) govern product behavior. Backend authorization and data-access rules require their own product implementation and evidence.

| Concern | Existing boundary or mitigation | Limit and review trigger |
|---|---|---|
| Divergent tokens, contracts, or generated output | Reuse the public barrel, edit canonical sources, regenerate artifacts, and validate aliases, schemas, catalog coverage, and generated integrity. Specification edits must also update the hash in `provenance.json`. | New components and foundational changes must include their documentation and validation evidence; generator output must not be repaired manually. |
| Accessibility gaps | Contracts define keyboard and focus behavior. Automated checks supplement the manual checks and evidence described in the [accessibility foundation](foundations/accessibility.md). | Historical acceptance or waived manual checks do not establish conformance for later changes. Record the evidence for the changed interface. |
| Validation touching production data or services | The [product-workflow pattern](patterns/product-workflows.md) requires development fixtures and design-system validation to avoid production services, private media, payments, and model APIs. | A fixture or test requiring external effects needs a separately scoped test plan; it cannot silently become part of design-system validation. |
| Growing maintenance and runtime cost | Risk-tier validation limits routine work to the affected files, route, or story, while final release gates retain broad coverage. JavaScript media queries use the generated breakpoint subset through the public barrel. | No measured numeric build-time, bundle-size, or suite-duration budget is specified here. Set budgets when a measured problem or explicit product requirement provides a basis. |
| Breaking contracts and broader distribution | Owner approval, versioning, deprecation windows, and release gates apply. The system remains repository-local. | New consumers, publishing, and breaking migrations require an explicit scope and compatibility decision. |

These safeguards define the current assessment boundary. Remaining unknowns must be recorded with the affected change rather than represented as completed security, performance, or accessibility evidence.

## 17. Adoption roadmap

### Confirmed sequence

1. Create the repository design-system structure, canonical DTCG tokens, generated CSS and TypeScript, Geist font loading, validation scripts, and root `AGENTS.md`.
2. Implement the reusable React/TypeScript foundation: layout primitives, actions, inputs, navigation, feedback, overlays, and data-display components.
3. Add Storybook, component contracts, accessibility tests, desktop/mobile visual baselines, and the local Test4Test design-system Skill.
4. Integrate the completed system into the active Test4Test repository without treating one workflow as a special pilot.
5. Apply the system later during a separately scoped redesign of the entire marketing site and authenticated web application.
6. Replace legacy raw values and one-off UI systematically, add Test4Test-specific components from real workflows, and deprecate superseded patterns.
7. Tag the first stable release, run continuous validation, record decisions and exceptions, and measure adoption and regressions.

The operating team is primarily the user as owner/approver and Codex as implementation agent. The system is built to support a redesign.

First-release success criteria are:

- New design-system UI contains no unapproved raw values.
- Documented components cover the intended reusable foundation.
- WCAG 2.2 AA gates pass.
- Desktop and mobile baselines pass review.
- Production build, TypeScript, schema, and component checks pass.
- Codex can build conforming interfaces without inventing conventions.
