# Visual baselines

The 352 tracked baselines cover 67 component and pattern story states plus 21 application route states at 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900. The story set contains every catalog component, representative family compositions, public and authenticated navigation, every toast tone, and explicit open states for the mobile drawer, dialog, drawer, popover, and tooltip. Exact Storybook size, variant, and state annotations are validated against the catalog, and every component contract story is required in this suite. The canonical route-state registry covers public, authentication, submission, earning, standard and recording test sessions, data presentation, account, admin, banned, blog, success, email-preview, and unknown-route fallback surfaces.

Additional checks cover 320 px reflow, 200% text enlargement, reduced motion, and forced colors. Production-independent fixtures provide authenticated and data-heavy states, and the test harness fails if a route contacts Supabase.

Update baselines only when the design-system owner approves an intentional visual change. The visual gate was approved on 2026-07-23. `npm run ds:visual` must fail for unexplained differences.
