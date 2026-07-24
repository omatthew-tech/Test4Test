# Test4Test repository instructions

Before creating or changing interface code, read `design-system/README.md` and invoke the repository skill at `.agents/skills/test4test-design-system/`.

- Import reusable UI only from `@test4test/design-system`.
- Consume semantic or component tokens; do not invent raw colors, spacing, type, radii, shadows, motion, or breakpoints.
- Preserve product behavior, routes, data contracts, and user-authored changes unless the task explicitly changes them.
- A new reusable component requires typed React code, a catalog entry, contract, examples or stories, accessibility behavior, and tests.
- Inline presentation is limited to documented runtime values such as progress percentages, measured waveform heights, and SVG geometry.
- Validate changed interfaces at 390 × 844 and 1440 × 900 and run `npm run ds:check`.
- Record any exception in `design-system/exceptions.json`; exceptions need an owner, rationale, scope, and expiration.
