# New-user inactivity follow-up

The `new_user_inactivity_followup` email is a one-time message from
`Matt @ Test4Test <Matt@Test4Test.io>`, with the same Reply-To address and the
subject `Question about Test4Test?`. The migration contains the exact plain-text
and HTML copy; only “Just reply to this email” is bold in HTML.

## Eligibility

Enrollment starts at the fixed `private.new_user_followup_config.launched_at`
timestamp. Only Auth accounts created at or after that timestamp qualify.
The first successfully persisted submission creates a durable row due 70 minutes
later. Guest drafts do not start the timer. The existing five-minute Cloudflare
recovery schedule normally delivers between 70 and 75 minutes, subject to queue
backlog and provider availability. Later submissions never reset a recorded timer.

Any positive `earned_test` transaction or Share-page Copy-link activation suppresses
the message. Credit purchases, adjustments, spent balance, page views, generated
slugs, and message autosaves are not activation signals. Clicks are recorded before
clipboard work, including failed copy attempts, through the owner-checked
`record_share_link_copy_click` RPC. Client transport failures retry twice without
blocking clipboard access, and stop if the signed-in account changes.

Activity, current Auth email, account bans and remaining submissions are rechecked
at the atomic transition to `sending`, immediately before the provider request.
Account deletion removes its queue row. Submission deletion preserves the lifetime
queue record; a user with no remaining submission is cancelled at send time.

## Delivery and permissions

Private queue/config tables have RLS enabled and no direct browser grants. The
public worker RPC is service-role only. Public click tracking uses an invoker
wrapper around a private function that checks `auth.uid()` and ownership.

The scheduler invokes `send-new-user-followups` only when work is due, using the
existing Vault `test_back_reminder_cron_secret` and matching Edge secret
`TEST_BACK_REMINDER_CRON_SECRET`. The endpoint checks the secret before DB access.
Other queue dispatchers and existing cron schedules are preserved.

Batches contain at most ten jobs with five-minute leases. Confirmed provider
rejections retry after 5, 10, 20 and 40 minutes, with five attempts total. Transport
timeouts, malformed provider responses and expired `sending` leases go to `review`
instead of resending. Expired claims that never began sending are recoverable.
Provider acceptance is persisted before best-effort delivery logging. If that
acknowledgement cannot be persisted, inspect SMTP2GO using the delivery-log/lease
record before any manual resolution; do not reset `review` rows blindly.

## Operations

Authenticated POST `{ "dryRun": true }` performs only reads, returns counts and
the rendered template, and checks SMTP2GO's verified sender-domain configuration.
It does not claim jobs, send emails or write delivery logs. An HTTP 200 dry run
must also report `senderVerified: true` before activation.

Administrator-only diagnostics:

```sql
select public.new_user_followup_worker('inspect');
select action, last_success_at, result
from private.background_scheduler_health where action = 'recover';
select status, count(*), min(due_at) as oldest_due
from private.new_user_followups group by status;
```

Pause this feature without changing other jobs:

```sql
update private.new_user_followup_config set enabled = false;
```

Keep the original launch timestamp when resuming. Alert/investigate if recovery
is older than ten minutes, due pending jobs persist across scheduler runs, or
`review`/`failed` counts increase. Provider acceptance does not establish inbox
receipt.

## Rollout evidence

- Migration: `20261011143243_new_user_inactivity_followup.sql`.
- Edge Function: `send-new-user-followups`, version 1.
- Initial production dry run: pg_net request 299, HTTP 200, sender verified,
  enrollment disabled, and zero queued/delivered messages.
- Live grants deny anonymous clicks, browser queue reads and browser worker calls;
  authenticated owner clicks and service worker calls are permitted.
- Security advisors added only the two expected private-table RLS-without-policy
  informational notices (intentional deny-by-default access).
- 28 focused database, worker, email and Share-interaction tests pass. Deno type
  checks, targeted format/lint/type/design-system checks and the isolated production
  build pass. Mobile (390 × 844) and desktop (1440 × 900) Share inspection confirms
  working clipboard feedback and no horizontal overflow.
- The isolated frontend base matches all 78 deployed JavaScript/CSS chunks after
  normalizing generated filenames. Its build preserves production's disabled
  checkout flag, independently of local build settings. Only the Share handler
  and its tracking helper are added to that clean base; concurrent workspace
  changes are excluded from deployment.
- Frontend: Cloudflare version `0911c463-a173-4644-941b-ab27811501ba`;
  production entry `index-Bb39kFjj.js`. Live Share JavaScript matches the isolated
  build and contains the new RPC; unauthenticated worker calls return HTTP 401.
- Enabled on October 11, 2026 at **10:47:36 a.m. Eastern**
  (`2026-10-11T14:47:36.086364Z`). Existing accounts were not enrolled.
- Post-activation dry run: request 301, HTTP 200, `enabled: true`, sender verified,
  zero due/sent/failed/review jobs. The next natural recovery run succeeded at
  `2026-10-11T14:52:31.319367Z`, including the new due-work check. Anonymous
  PostgREST click requests return HTTP 401 / `42501` rather than a missing-RPC error.
- Isolated Share accessibility, clipboard and existing visual-baseline checks
  pass at all four approved viewport sizes. No baselines were changed.
- Full repository checks passed 787 unit tests (one skipped), 77 component tests,
  and 313 accessibility/journey tests. The full visual run completed with 391
  passes and 25 failures: four action-variant network-idle timeouts, one tabs
  comparison, and comparisons on Messages, message conversation, Submissions,
  Profile and tester Profile. Share passed in both the shared checkout and
  isolated release. These other surfaces were not changed by this feature.
- Handoff classification: **Fast-checked**, not Release-validated, because the
  full repository visual gate did not pass. The isolated production build and
  targeted four-viewport release checks passed; no baseline updates or unrelated
  source fixes were included. Validation sent no customer emails.
