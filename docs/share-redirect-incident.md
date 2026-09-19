# Share/sign-in redirect loop

## Confirmed cause (September 18, 2026)

The signed-in production browser logged `A valid rating from 1 to 5 stars is
required` while loading Share. A read-only database audit found 17 feedback
ratings: 16 had no `star_rating` (3 legacy `frowny`, 13 legacy `smiley`). Migration
`20260918021245_exact_star_ratings` was absent from production migration history.
The deployed frontend required exact stars before the historical data had been
converted.

Share unnecessarily loaded feedback ratings and other workspace data. When a
rating could not be decoded, `AppStateProvider.refreshState` replaced the entire
state, including the authenticated profile, with an anonymous empty state.
The protected route redirected to `/sign-in?returnTo=%2Fshare`. Sign-in's lighter
load successfully restored the authenticated profile and redirected back to
Share, repeating the failure. The URL encoding was correct.

## Fix and invariants

- Share loads the authenticated profile and that owner's submissions only.
- Stored legacy ratings map to the already-defined 1/3/5 conversion only when an
  exact score is absent. Explicit stars always win, and corrupt explicit values
  still fail validation. This supports deployments on either side of the migration.
- A failed state load has an explicit error state. A confirmed profile survives
  a subsequent data error; failed collections are not presented as empty data.
- The application shows a retry screen before route guards can act on failed
  state. A failure never silently becomes a sign-out or a redirect loop.
- Missing or rejected sessions still redirect to sign-in with the destination
  preserved. Temporary auth/network errors get a retry instead.
- Stale or aborted requests cannot replace the current route's data or error.
- The existing validation workflow now runs on production branch `ReDesign`.

Regression coverage lives in `tests/unit/app-state-loading.test.tsx`,
`tests/unit/star-ratings.test.tsx`, and
`tests/unit/recording-feedback-data.test.ts`. It covers legacy ratings, narrowed
Share reads, route failures, repeated retries, recovery, auth/profile failures,
real anonymous sessions, and stale request completion.

## Release and future migrations

This frontend fix tolerates the current production data without rewriting user
ratings. The existing exact-stars migration is still needed for the complete
rating schema and write/RPC behavior. Apply it as a separately validated backend
release; do not silently substitute a new mapping or alter existing explicit scores.

For future required-column changes, use an expand/backfill/contract rollout:
deploy compatible readers, apply and verify the migration, then remove legacy
compatibility only after all supported environments satisfy the new contract.
Verify migration history and aggregate data constraints before promoting a
frontend that requires a new field. Backend loading failures must continue to
have regression coverage independent of sign-in state.

## Validation and rollout

The fix is **Fast-checked**, with an isolated checkout prepared at
`C:/Users/matth/.codex/worktrees/share-redirect-fix/Test4Test-Redesign` so concurrent
Earn work is excluded. All 345 unit tests, changed-file formatting/lint/type
checks, design-system invariants, and the production build pass there. The Share
route passes all four accessibility checks (WCAG, narrow reflow, enlarged text,
and forced-colors/reduced-motion). The failure screen and successful retry were
also inspected at 1440 × 900 and 390 × 844 using an isolated mock backend.

The full release command passed its unit and 74 component tests, then stopped
after 226 application checks passed and 13 failed outside Share. That run overlapped
unrelated Earn edits in the shared workspace, so it is not release validation of
the isolated fix. Share's four screenshot comparisons also fail against the
checked-in baselines. Repeating those four captures against the unmodified HEAD
produced byte-for-byte identical PNGs to the fixed revision at mobile, tablet,
laptop, and desktop sizes, confirming those differences predate this fix.
Baselines have not been rewritten.

This fix requires only a frontend deployment. The existing database migration
remains a separate backend release. Production deployment was approved in the
incident task after review of the validation results.
