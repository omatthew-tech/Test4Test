---
name: test4test-design-system
description: Build, migrate, review, and validate Test4Test interface code against the repository design system. Use for any Test4Test React UI change, component creation, visual conformance review, legacy-style migration, accessibility audit, token or contract update, Storybook work, or responsive interface verification.
---

# Test4Test design system

Use the repository as the source of truth. Preserve routes, business behavior, data contracts, and substantive content unless the user explicitly changes them.

## Required context

1. Read `design-system/README.md`.
2. Read only the relevant foundation, pattern, and component contract.
3. Inspect `design-system/components/catalog.json` before creating anything reusable.
4. Import UI from `@test4test/design-system`; do not deep-import implementation files.

## Change workflow

1. Identify the existing component or approved composition that satisfies the request.
2. Reuse semantic or component tokens. Never invent raw color, spacing, typography, radius, shadow, duration, or breakpoint values.
3. Keep visual presentation in CSS Modules. Limit inline styles to runtime data and geometry covered by `design-system/exceptions.json`.
4. Preserve semantic HTML, keyboard behavior, focus order, target size, labels, descriptions, live regions, reduced motion, and forced-colors behavior.
5. If no component fits, notify the human before adding one. Add typed implementation, catalog entry, contract, story, interaction test, accessibility behavior, and documentation together.
6. Visually inspect changed UI at 390 × 844 and 1440 × 900.
7. Run `npm run ds:check`.

## Migration workflow

1. Inventory selectors, raw values, embedded styles, and asset references in the target.
2. Replace legacy primitives with canonical components and semantic tokens without changing the workflow.
3. Include loading, empty, partial, error, permission, offline, destructive, long-content, and narrow-width states that apply.
4. Remove legacy code only after all references are gone and the route passes its functional, accessibility, and visual checks.
5. Record a time-bound exception when a runtime or browser constraint cannot use a canonical token.

## Validation

- `npm run ds:generate`: regenerate tokens and component artifacts.
- `npm run ds:validate`: validate schemas, aliases, generated integrity, contracts, catalog, exceptions, and raw-value policy.
- `npm run ds:a11y`: run automated component and route accessibility checks.
- `npm run ds:visual`: compare approved responsive baselines.
- `npm run ds:check`: run the complete release gate.

Automated results do not replace keyboard, NVDA/Chrome, or VoiceOver/Safari review.

## Reference

Read [references/review-checklist.md](references/review-checklist.md) for a conformance or migration review.
