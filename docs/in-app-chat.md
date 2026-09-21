# Private chat and message notifications

Founders start conversations from a registered tester's recording. Each app/tester pair has one
conversation across response revisions. Both participants can read and reply at `/messages` and
`/messages/:conversationId`; tester accounts use the shared authenticated route without gaining
access to founder workspace pages. Sign-in retains the conversation destination.

The first send creates the conversation. Messages are plain text, up to 4,000 Unicode code points,
with a sender-wide limit of 20 per minute. No attachments, edits, deletion controls, typing indicators,
or public read receipts are included. Failed sends preserve the draft and request ID for retry.

## Data and authorization

`20260920194929_in_app_chat.sql` adds `chat_conversations`, `chat_messages`, `chat_read_states`, and
`chat_notification_outbox`. Foreign keys follow app/account deletion. Public table access is
SELECT-only for authorized participants; the outbox is service-only. Participant read state is
visible only to its owner. Explicit authentication and profile ban checks apply to every operation.

The browser uses `chat_context`, `chat_list`, `chat_history`, `chat_send`, and `chat_mark_read` RPCs.
Public wrappers are security invokers; private helpers verify the caller with fixed search paths.
Profile joins return only the app name and the other participant's display name and availability.
Email addresses never appear in chat responses. RLS also applies to Realtime table subscriptions.

`chat_send` derives participants from ownership/membership, serializes sender limits and conversation
writes, and atomically saves the message, initial email job, and unread reminder jobs. A unique
sender/request ID prevents duplicates across retries. Reusing it with different content or a different
conversation is rejected. History is keyset-paginated in batches of 50; the inbox uses batches of 30.

The client reconciles missed history after reconnecting, refreshes on focus, and polls every 15 seconds
while Realtime is unavailable. A displayed message's timestamp must intersect the visible history
region in a focused, foreground tab before its sequence is acknowledged. Read state advances
monotonically; email views and link scanners do not acknowledge chat messages.

## Email and reminder behavior

Every message creates an initial email, even if it is read before the worker runs. Per recipient and
conversation, the first unread message starts one reminder period with jobs due at days 3 and 7.
Additional incoming messages do not restart it. Each reminder previews the first remaining unread
message. Reading all incoming messages cancels unsent reminders, including claimed jobs. A later
unread message creates a fresh period. There is no further reminder after day 7 until that reset.

The worker checks eligibility immediately before each send. An email already handed to the provider
cannot be recalled if the recipient reads the conversation concurrently. Initial notifications remain
independent of read state. Unavailable/deleted participants cancel delivery.

HTML contains exactly the brand, role/app headline, escaped 160-character excerpt, and View message
button. Reminder status changes the subject only. Both directions have appropriate headline copy.
No marketing or personal email address appears in the body. `generate:chat-email` serializes existing
design tokens for email-client compatibility and rasterizes the canonical logo. To regenerate and
preview the exact production renderer:

```powershell
npm run generate:chat-email
node scripts/generate-chat-email.mjs --check
node scripts/preview-chat-email.mjs
```

The preview is `output/chat-email-preview.html`. The format exception expires March 20, 2027.

## Delivery and rollout

The internal `dispatch-chat-notifications` Edge Function reuses SMTP2GO and `email_delivery_logs`.
It requires `CHAT_DISPATCH_SECRET`; browser JWTs alone cannot invoke it. Its configuration disables
gateway JWT checking only because the handler verifies this dedicated server secret.

Jobs have atomic SKIP LOCKED claims, a unique lease, a five-minute expiry, and up to five attempts.
Failed attempts back off exponentially starting at two minutes, subject to the five-attempt cap.
Each worker claims at most ten jobs; provider requests have a 15-second timeout. Stale leases cannot
finish another worker's job. Provider success is recorded before best-effort delivery logging, so a
log failure does not trigger a resend. Delivery is **at least once**: a provider-accepted send followed
by an ambiguous network failure or failed database confirmation can be duplicated on recovery.
Reconcile provider IDs and logs before manually replaying uncertain jobs.

1. Provision/select an approved preview Supabase environment and apply the migration there first.
   The existing hosted Test4Test project has no preview branch as of this implementation check.
2. Deploy the worker using `supabase/config.toml`. Supply existing `SMTP2GO_API_KEY`,
   `SMTP2GO_SENDER`, Supabase server credentials, and an `APP_BASE_URL` for that environment.
3. Generate a dedicated `CHAT_DISPATCH_SECRET`. Set it in Edge Function secrets and Vault under
   `chat_dispatch_secret`. Ensure Vault's `project_url` points to the same environment.
4. Enable/verify `pg_cron`, `pg_net`, and Vault. The migration schedules
   `private.dispatch_chat_notifications()` every minute if infrastructure is present. Otherwise,
   register the named `dispatch-chat-notifications` minute job after infrastructure is ready.
   Missing secrets leave the durable queue pending rather than dropping messages.
5. Confirm `chat_conversations`, `chat_messages`, and `chat_read_states` are in the
   `supabase_realtime` publication. Verify two consented preview accounts can exchange messages,
   unrelated accounts cannot read them, and only the two intended email recipients receive mail.
6. Exercise initial delivery and both reminder stages with controlled preview data. Check cancellation
   after reading, reconnects, concurrent workers, and provider failures. Do not send test messages
   to real testers. Local PGlite tests do not certify hosted RLS/Realtime, Cron, SMTP credentials, or
   inbox placement; inspect Gmail and Outlook rendering with consented test inboxes.
7. Follow the repository production-promotion approval boundary, deploy schema and worker before
   enabling the frontend release, and include the PNG logo in the frontend deployment.

Monitor pending-job age (initial jobs should normally dispatch within a minute), failed/exhausted
jobs, expired leases, Cron failures, and provider-confirmation failures. Logs contain queue IDs,
stage and attempts, never message bodies or secrets. To pause email delivery, unschedule the named
dispatcher; messages and pending jobs remain durable. A frontend rollback may restore email handoff
without dropping chat tables or conversation history.

## Validation

- Isolated PostgreSQL tests execute the actual migration, including role isolation, direct-write
  denial, two-way replies, pagination, deduplication, rate limiting, unread periods, job claims,
  cancellation, ban checks, and cascading deletion.
- Unit tests cover retained drafts, retry IDs, duplicate pending submissions, visible-only read
  acknowledgement, reconnect pagination, safe HTML, Unicode excerpts, worker authentication,
  cancelled reminders, and provider/logging failures.
- Fixture-only browser journeys cover founder/tester sending, persistence, sign-in return links,
  the recording entry point, 390 × 844 and 1440 × 900 layouts, reflow, and accessibility. They never
  call production Supabase or send real email. Chat and email screenshots were inspected.
- Full unit run: 438 tests passed. All five chat/email browser journeys and both recording-feedback
  journeys passed. The Edge Function passed Deno type checking, and generated email tokens are current.
  The full `npm run ds:check` release gate was attempted and stopped
  on unrelated in-progress formatting issues in timeline-range components/stories and email-reminder
  tests. The targeted invariant check also found unrelated timeline-range inline-style markers.
  The build also stopped on an unrelated `replaceAll` TypeScript error in
  `tests/unit/recording-clips-database.test.ts`. No visual baselines were updated.
  This work is **Fast-checked, not Release-validated**; rerun the
  release gate after the other workspace changes settle and the new navigation visuals are accepted.

## Production deployment — September 20, 2026

The owner explicitly approved production deployment after reviewing the implementation.

- Applied the chat migration to `lteimepkxuiupbcsbcpz` as `20260920194929`; the local filename
  matches hosted migration history. Existing unrelated migrations were not applied.
- Deployed `dispatch-chat-notifications` with its dedicated server secret in Edge Function secrets
  and Vault. The minute Cron job is active; scheduled invocations return HTTP 200. Unauthorized
  invocations return HTTP 401. Existing SMTP2GO credentials and application URL were retained.
- Verified RLS on all four tables, participant grants, service-only queue access, and all three
  Realtime publication entries. A production transaction verified founder/tester replies,
  idempotency, unread counts, reminder cancellation, and outsider isolation, then rolled back.
  No verification messages were persisted and no test emails were sent.
- Published Cloudflare Worker `test4test-redesign` version
  `fe5dad57-8573-4725-83fd-ccc36dd0d3b0` to `https://test4test.io`.
  The previous version, `3eba358e-b712-4280-93d8-b8f03f7a0a77`, is the frontend rollback target.
  The isolated release preserves the already-live Earn experiment and excludes unrelated pending
  recording-clip, expandable-description, and transcript-style interface changes.
- The exact release passed the production build, formatting, type checking, design-system
  invariants, 399 unit tests, and seven targeted chat/email/recording browser journeys.
  The full release gate stopped when Storybook could not import its setup module through the
  isolated build's shared dependency path; it did not complete the broad visual suite. No visual
  baselines were updated. Classification remains **Fast-checked, not Release-validated**.
- Production JavaScript and the PNG email logo return HTTP 200. The owner will verify a real
  conversation and email receipt; inbox placement and live two-browser Realtime delivery are
  not certified by the empty-queue worker check.

### Account-menu follow-up

Messages now appears directly after My reviews in the founder account dropdown and after Profile
for testers. The mobile Account group uses the same order. Unread counts remain visible there.
Deployed as Cloudflare version `ff481f1c-a764-4908-8e5d-4f956a5b2b0a`; the prior chat version
`fe5dad57-8573-4725-83fd-ccc36dd0d3b0` is the rollback target for this navigation-only change.
All nine navigation browser journeys, the fast checks, and the production build passed. Both
requested viewport sizes were inspected. The full gate encountered the same Storybook setup-import
limitation above. The served layout asset matches the validated build. **Fast-checked**.

The subsequent requested swap puts the founder items in this order: Profile, Messages, My reviews,
New app, Sign out. It is deployed as `6351afbf-67e8-4d9f-a959-69c112cf33d1`, with
`ff481f1c-a764-4908-8e5d-4f956a5b2b0a` as the previous version. Fast checks, the production build,
and all nine responsive navigation journeys passed; the same Storybook setup-import limitation
prevented full release validation. The live layout asset matches the tested build. **Fast-checked**.
