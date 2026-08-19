# Visual baselines

The 356 tracked baselines cover 67 component and pattern story states plus 22 renderable application route states at 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900. The story set contains every catalog component, representative family compositions, public and authenticated navigation, every toast tone, and explicit open states for the mobile drawer, dialog, drawer, popover, and tooltip. Exact Storybook size, variant, and state annotations are validated against the catalog, and every component contract story is required in this suite. The canonical route-state registry covers public, authentication, submission, earning, standard and recording test sessions, data presentation, account, admin, banned, blog, success, email-preview, redirect-only legacy paths, and unknown-route fallback surfaces.

Additional checks cover 320 px reflow, 200% text enlargement, reduced motion, and forced colors. Production-independent fixtures provide authenticated and data-heavy states, and the test harness fails if a route contacts Supabase.

During iteration, inspect the affected route or story without updating snapshots. Update baselines only after the design-system owner accepts an intentional visual change:

- `npm run ds:visual:update:route -- <route-name>` updates one route at all approved viewports.
- `npm run ds:visual:update:story -- <story-id>` updates one story at all approved viewports.

After the accepted design batch is final, run `npm run ds:check` once. The visual gate was approved on 2026-07-23. `npm run ds:visual` must fail for unexplained differences; never rewrite a baseline merely to make that gate pass.
