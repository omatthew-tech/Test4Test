---
name: test4test-design-system
description: Build and validate Tier 2–3 Test4Test interface work against the repository design system. Use for local interactions or responsive layouts, new features or reusable components, shared component changes, token or foundation changes, migrations, visual conformance reviews, accessibility audits, Storybook work, and multi-route changes. Do not use for Tier 0 content edits or Tier 1 local token swaps unless the work must escalate because no approved token or component fits.
---

# Test4Test design system

Use the repository as the source of truth. Preserve routes, business behavior, data contracts, and substantive content unless the user explicitly changes them.

## Scope

- Tier 2 covers focus, hover, responsive layout, and route-local behavior.
- Tier 3 covers new features or reusable components, shared component changes, token or foundation changes, migrations, and multi-route impact.
- Escalate when an existing semantic token, component, or approved composition cannot satisfy the request.
- Keep Tier 0–1 work on the fast path defined in `AGENTS.md`.

## Required context

1. Read `design-system/README.md`.
2. Read only the relevant foundation, pattern, and component contract.
3. Inspect `design-system/components/catalog.json` only before creating or changing reusable UI.
4. Import UI from `@test4test/design-system`; do not deep-import implementation files.

## Change workflow

1. Identify the existing component or approved composition that satisfies the request.
2. Reuse semantic or component tokens. Never invent raw color, spacing, typography, radius, shadow, duration, or breakpoint values.
3. Keep visual presentation in CSS Modules. Limit inline styles to runtime data and geometry covered by `design-system/exceptions.json`.
4. Preserve semantic HTML, keyboard behavior, focus order, target size, labels, descriptions, live regions, reduced motion, and forced-colors behavior.
5. If no component fits, notify the human before adding one. Add typed implementation, catalog entry, contract, story, interaction test, accessibility behavior, and documentation together.
6. For Tier 2, inspect the affected viewport and a responsive counterpart; use 390 × 844 and 1440 × 900 when layout can reflow.
7. Run the targeted route or Storybook check that covers the change.
8. For Tier 3, inspect at 390 × 844 and 1440 × 900 and run the complete release gate.

## Migration workflow

1. Inventory selectors, raw values, embedded styles, and asset references in the target.
2. Replace legacy primitives with canonical components and semantic tokens without changing the workflow.
3. Include loading, empty, partial, error, permission, offline, destructive, long-content, and narrow-width states that apply.
4. Remove legacy code only after all references are gone and the route passes its functional, accessibility, and visual checks.
5. Record a time-bound exception when a runtime or browser constraint cannot use a canonical token.

## Validation

- `npm run ds:generate`: regenerate tokens and component artifacts.
- `npm run ds:validate`: validate schemas, aliases, generated integrity, contracts, catalog, exceptions, and raw-value policy.
- `npm run ds:check:fast -- <files...>`: format-check and lint changed files, type-check code changes, and validate design-system invariants.
- `npm run ds:check:route -- <route-name>`: run accessibility and visual checks for one canonical route state.
- `npm run ds:check:story -- <story-id>`: build Storybook and visually verify one story at all approved viewports.
- `npm run ds:visual:update:route -- <route-name>`: update one accepted route baseline set.
- `npm run ds:visual:update:story -- <story-id>`: update one accepted Storybook baseline set.
- `npm run ds:a11y`: run automated component and route accessibility checks.
- `npm run ds:visual`: compare approved responsive baselines.
- `npm run ds:check`: run the complete release gate for Tier 3, accepted design batches, commits or PRs, explicit final validation, and CI.

Do not update baselines merely to make a failing test pass. During iteration, use browser inspection or targeted comparisons. Update affected baselines only after the design-system owner accepts the visual change, then run the release gate once at finalization.

Report Tier 0–2 handoffs as `Fast-checked` and full-gate handoffs as `Release-validated`.

## Reference

Read [references/review-checklist.md](references/review-checklist.md) for a conformance or migration review.
