# Test-back rate availability

The rate counts unique testers, not individual responses:

`completed / (completed + overdue and currently available) * 100`

Percentages retain the existing whole-number rounding and default to 100 when
nothing is counted. A completed exchange still requires approved feedback with
an awarded credit in each direction. Completing any submission owned by an
inbound tester reciprocates that tester.

## Eligibility

`find_test_back_target_submission(tester, owner)` is the shared availability
lookup for rates, rate-transition previews, reminder targets, and creation of
reminder sequences. It matches Earn's system eligibility and the account's report
exclusions:

- The submission is live, open for more tests, and owned by another eligible
  account whose Earn listing is unlocked.
- The submission matches the viewer's testing pool and reward eligibility.
- The viewer has no existing response to that submission.
- The viewer has no pending or confirmed submission report for that submission.
  Dismissed reports and other viewers' reports do not exclude it.

Personal Web/iOS/Android filters do not affect reputation. A tester still counts
if any other eligible submission is available. No new credit-balance gate is
introduced.

Completed test-backs remain credited when apps close or owners become restricted.
Outstanding test-backs are excluded while unavailable and resume counting when
availability returns, using their existing `affects_test_back_rate` flag. The
migration does not reset grace periods, erase penalties, restart cancelled
reminders, or rewrite feedback, credits, reports, or email history.

The reminder worker uses the database lookup instead of maintaining a separate
eligibility implementation. Lookup errors defer delivery instead of treating a
failure as unavailability. Missing targets retain the existing cancellation
behavior. Already-delivered reminders retain their deduplication and reconciliation
behavior; current availability determines whether their historical penalty counts.

## Validation

- Database regressions execute the migration in PGlite and compare availability
  with Earn's listing query plus report exclusions.
- Coverage includes unavailable targets, reopening, dismissed reports, alternate
  submissions, grace periods, completed history, unique testers, platform filters,
  paid-tester eligibility, and empty-rate defaults.
- An account-shaped fixture with 26 completed and four unavailable outstanding
  testers returns 100% with 26 of 26 counted.
- Worker regressions cover server eligibility, RPC failures, final-reminder rates,
  overlapping workers, stale batches, and delivered-message reconciliation.
- Earn coverage verifies that 100% hides Improve rate and lower rates retain the
  existing scrolling and focus behavior.

Local validation on September 27:

- The 70 focused tests passed. The complete unit suite passed 679 tests with
  one skipped, and all 77 component tests passed.
- Formatting, lint (warnings only), TypeScript, design-system validation, the
  accessibility/interaction suite, and the worker's Deno type check passed.
- The production build, including blog prerendering, passed. The changed-file
  validation lane completed with **Fast-checked** status.
- The completed-rate Earn state was inspected at 390 × 844 and 1440 × 900.
- The focused Earn route check passed all four accessibility/reflow checks and
  all four mobile/tablet/laptop/desktop visual comparisons.
- The full release run reached the visual suite, where the first three
  Storybook cases timed out at `page.waitForLoadState("networkidle")` despite
  rendering their content. The repetitive run was stopped; no visual baselines
  were changed. Full release validation is therefore incomplete.

## Deployment

Apply only the `available_test_back_rates` migration, then deploy the updated
`send-test-back-reminders` worker. Do not replay unrelated older migrations:
production and the repository have historical differences.

Preserve the hosted worker's other files and its custom Cron authentication
(`verify_jwt: false` remains required by that existing authentication flow).
The previously deployed worker is compatible with the migration during rollout.
The RPC names, arguments, return types, and grants remain unchanged.

After deployment, verify the account's rate and current/next-rate previews, query
representative rankings, run security advisors, and invoke the worker only with
`dryRun: true` for operational verification. Do not trigger real reminder emails
as a deployment test.

On September 27, local implementation and focused checks completed, but production
read checks hit connection timeouts. Independent health checks at 22:38,
22:46, and 23:02 UTC reported Auth HTTP 504 and database API timeout.

After deployment was authorized, the migration service was attempted directly.
It failed before applying the migration: `Failed to initialise history table:
Connection terminated due to connection timeout`. The hosted reminder worker
was rechecked and remains at version 37, matching the saved pre-change bundle.
The updated worker was not deployed because the database migration is required
first. Deployment and live verification remain blocked on backend recovery.

The owner subsequently authorized a production restart. One restart was submitted
at approximately 00:00:13 UTC on September 28 (20:00 EDT on September 27), and
Supabase acknowledged `RESTARTING`. PostgreSQL started at 00:04:59 UTC, and a
database query succeeded at 00:05:04 UTC. All four health probes passed at
00:06:30 UTC. The existing browser session subsequently loaded account data.
This confirms current recovery, not a permanent fix for the recurring outage.

### Completed production deployment

- Supabase applied `available_test_back_rates` as version `20260928000553` at
  00:05 UTC on September 28. The local migration filename and database test
  reference now match the hosted version; its SQL is unchanged.
- `send-test-back-reminders` version **38** is active. Its downloaded source
  matches the prepared bundle, with only the shared reminder helper changed.
- The account's live rate changed from **26/30 = 87%** to **26/26 = 100%**.
  All four unavailable outstanding testers returned no target, and their
  current/next-rate previews both returned 100%.
- The signed-in browser confirmed the account email and displayed 100% on
  Earn, without an Improve rate button. Homepage rankings returned six rows.
- The authenticated worker dry run returned HTTP 200 and `ok: true`, with zero
  due feedback, reminders, or report shares. This check sent no emails.
- RPC arguments, return types, and grants match the pre-deployment snapshot.
  Security advisors still flag the existing public execution grants on these
  `SECURITY DEFINER` functions; this release does not expand them. See the
  [Supabase execution-grant guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
  Advisors also report existing RLS-without-policy and password-protection
  findings outside this change; no unrelated access settings were modified.
- The 32 database regressions passed again after aligning the migration name.
  Overall interface validation remains **Fast-checked**, with the earlier
  unrelated Storybook release-gate limitation recorded above.
