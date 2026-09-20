# Existing email delivery repair — September 20, 2026

## Production result

The repair is deployed to the Test4Test Supabase project. It does not introduce or
activate an email type. The paid-test availability sender remains undeployed.

The original 64 pending test-back sequences contained:

- 23 final reminders already recorded as sent. These are now complete without
  resending, and the original final-stage test-back-rate bookkeeping is applied.
- 7 exchanges without an eligible target app. These are now cancelled.
- 34 eligible exchanges awaiting their next reminder. These remain queued for
  the normal hourly worker, with its existing batch size and 24-hour stage spacing.

## Root cause and fixes

1. **Terminal-state database failures:** the Edge Function wrote
   `next_send_at = null` when resolving or cancelling a sequence, although the
   production column is NOT NULL. Terminal updates now retain a valid timestamp.
   Old records repeatedly occupied the first 25 slots in every hourly batch.
2. **Recovery without duplicate mail:** the migration reconciles final-stage
   deliveries against the exact sequence and triggering response, resolves
   reciprocated exchanges, and cancels missing targets. It is safe to rerun.
3. **Overlapping/stale workers:** a conditional five-minute claim requires the
   same pending stage, triggering response, and due timestamp. A stale or second
   worker skips the record. Failed work moves one hour forward so it cannot
   permanently block newer due work.
4. **Feedback/reminder ordering:** the hourly worker selects due reminders only
   after new-feedback processing has advanced initial sequences. This avoids
   sending an initial reminder from the same batch's stale snapshot.
5. **Scheduler timeouts:** the existing hourly and daily HTTP jobs used pg_net's
   two-second default; six recent hourly network responses were confirmed as
   timeouts. Their timeout is now 120 seconds. Schedules, URLs, and Vault-backed
   authentication remain unchanged.
6. **Google Play delivery bookkeeping:** the existing sender's template/log key
   was absent from `email_templates`, violating the delivery-log foreign key.
   The key is registered and checked before SMTP. Checked-in/already-notified
   participants are filtered before the batch limit, and an empty batch exits
   without unnecessary profile queries. No active participations existed during
   verification; the 32 previously missed participations were not restarted.
7. **False success responses:** partial scheduled-job failures return HTTP 500;
   tip-payment-method follow-up failures return HTTP 502 with a failure count,
   instead of claiming that no notifications were needed.
8. **Moderation email retries:** repeating the same saved decision retries only
   missing emails, identified by report, recipient, and template. It does not
   change the saved decision, re-pause the app, or award another credit.
9. **Production feature preservation and diagnostics:** shared-report reminder
   handling was present in production but missing locally. It is retained and
   restored locally. Both scheduled workers now accept an authenticated
   `dryRun: true` request that reads readiness without sending or updating jobs.

## Deployment and validation

- `send-test-back-reminders`: v33
- `send-google-play-closed-test-reminders`: v16
- `send-tip-payment-method-added`: v22
- `manage-test-reports`: v19
- Migration: `20260920182401_repair_existing_email_delivery.sql`

Deployment bundles were assembled from the existing hosted functions plus these
repairs. Existing production destinations and hosted-only dependencies were
preserved; unrelated in-progress workspace changes were not deployed.

All 25 focused tests passed across `email-reminders.test.ts`,
`email-delivery-database.test.ts`, `email-workers.test.ts`, and
`email-event-retries.test.ts`. Tests use fake SMTP and a local PGlite database.
The four modified Edge Functions and the exact deployment bundles passed Deno
type checks. Targeted ESLint and Prettier checks passed. Supabase security advisors
reported no added findings.

Live authenticated dry-run requests 8629 and 8630 both returned HTTP 200 with
`ok: true` and `dryRun: true`. The hourly job found 34 reminders, zero recent
feedback retries, and zero shared-report reminders. The daily job found zero
due participants. The next scheduled hourly run at verification was
2026-09-20 19:00 UTC (3 p.m. Eastern). No live send was triggered for validation.

Three historical approved responses from March/April remain outside the existing
seven-day new-feedback retry window. No old feedback emails were backfilled.
No pending tip follow-ups were found. Actual receipt of the resumed scheduled
emails has not yet been observed.

The final application TypeScript check passed.

## Operational checks

The worker's HTTP result must be checked as well as the Cron dispatch result:
Cron success only confirms that the asynchronous HTTP request was enqueued.
See the [Supabase pg_net documentation](https://supabase.com/docs/guides/database/extensions/pg_net).

Use authenticated dry runs before manually investigating delivery; do not invoke
the normal sender merely to test configuration. Delivery-log rows mean SMTP2GO
accepted a message, not that it necessarily reached a recipient's inbox.
