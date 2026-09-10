# Dynamic homepage submitted-test count

Status: **Fast-checked**. The count endpoint is deployed and verified. The complete release gate was run but is not green because of three existing homepage content assertions outside this change.

## Behavior

- The caption now reads `Trusted by <count>+ global startups`, followed by five filled Lucide stars at the same 12px caption size. The user-requested star treatment is documented in `home-trust-caption-stars`; the live count is unchanged. Fast checks and all eight targeted homepage accessibility/Trusted by tests passed after this follow-up.
- Count submissions with `status = 'live'` whose owner exists and has `ban_status = 'clear'`.
- Include credit, paid, Google Play, and link-only tests, including published tests closed to more responses. Exclude drafts, pending verification, paused, flagged, deleted, orphaned, and banned-owner submissions.
- Count tests, independently of registered users and the six showcased cards.
- Fetch a single scalar separately from the page and cards. Refresh on mount, window focus, tab return, and every 60 seconds while visible. Skip overlapping requests and hidden tabs; abort requests after 10 seconds and on unmount.
- While unavailable, retain the caption without a numerical claim. Format valid totals with thousands separators and a trailing `+`.
- Preserve the existing 12px semantic caption typography and placement.

## Production verification

- Applied `20260910162749_home_submitted_test_count` to the Test4Test Supabase project after explicit user approval of public aggregate access. The initial application was blocked by automatic approval review; the approved retry succeeded.
- The endpoint returned **72** on September 10, 2026.
- Verified anonymous and authenticated execute grants, and verified the signed-out local homepage renders `Trusted by 72+ startups from around the world` against the production endpoint.
- The underlying count query used the existing live-submission index. `EXPLAIN ANALYZE` measured 8.364 ms execution and 18.501 ms initial planning; this excludes network latency. Rendering never waits for the request.

## Validation

- Fast checks: formatting, lint, TypeScript, design-system invariants passed.
- All 83 unit tests passed, including 18 tests for the new API loader, refresh lifecycle, and SQL migration. The migration tests execute the actual SQL in isolated PostgreSQL and verify publication/deletion/pausing, correct inclusion rules, equal anonymous/authenticated totals, empty totals, and denial of underlying record access.
- All 71 component tests passed.
- 174 route/accessibility/journey tests passed, including all four Trusted by journeys.
- Three unrelated homepage assertions failed: free-feedback heading expectations at desktop and mobile, and an old managed-recruitment heading. The tests expect `Test other founders` and `Most platforms give you tools. We go find the people.`; current page copy differs. These sections were not changed for the dynamic count.
- Production build passed separately. The full release command stopped at the unrelated journey failures before reaching visual baselines.
- Visually inspected at 1440 × 900 and 390 × 844 with local fixtures and the real count. No horizontal page overflow. No visual baselines updated.

Logs: [release check](release-check.log), [build check](build-check.log).

## Public aggregate access review

The new function intentionally uses definer privileges to return one consistent public aggregate across visitor roles without exposing individual rows or changing table policies. It accepts no parameters, performs no writes, qualifies all table names, fixes `search_path` to an empty string, revokes default PUBLIC execution, and grants only the intended visitor roles.

Supabase advisors added the expected notices for [anonymous execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Both describe the explicitly approved public scalar access; no unrelated advisor findings were changed.
