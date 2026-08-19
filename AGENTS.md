# Test4Test repository instructions

Apply these invariants to every interface change:

- Import reusable UI only from `@test4test/design-system`.
- Consume semantic or component tokens; do not invent raw colors, spacing, type, radii, shadows, motion, or breakpoints.
- Preserve product behavior, routes, data contracts, and user-authored changes unless the task explicitly changes them.
- Inline presentation is limited to documented runtime values such as progress percentages, measured waveform heights, and SVG geometry.
- Record any exception in `design-system/exceptions.json`; exceptions need an owner, rationale, scope, and expiration.

Classify interface work before acting:

- Tier 0 — content-only: direct text or label changes.
- Tier 1 — local visual tweak: replace an existing spacing, color, or typography token in one local selector.
- Tier 2 — local interaction or layout: focus, hover, responsive layout, or route-local behavior.
- Tier 3 — shared or structural: a new feature or reusable component, shared component change, token or foundation change, migration, or multi-route impact.

For Tier 0–1, do not load the design-system skill unless no existing token or component satisfies the request. Use the selected DOM path or component stack when provided, read only the target code and token reference, and run `npm run ds:check:fast -- <changed files>`.

For Tier 2–3, read `design-system/README.md` and invoke `.agents/skills/test4test-design-system/`. A new reusable component requires typed React code, a catalog entry, contract, examples or stories, accessibility behavior, and tests.

Use targeted route or Storybook checks during iteration. Inspect both 390 × 844 and 1440 × 900 when layout can reflow. Do not update visual baselines until the design-system owner accepts the visual change. Run `npm run ds:check` only for Tier 3, final validation of an accepted design batch, before a commit or PR, when explicitly requested, or in CI.

Report completed interface work as `Fast-checked` or `Release-validated`.
