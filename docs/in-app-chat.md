# Private chat and message notifications

Founders start conversations from a registered tester's recording; testers can start them from the
message icon on their submitted feedback cards. Each app/tester pair has one
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

`20261001022459_allow_tester_started_conversations.sql` allows either the app owner or the registered
tester on a response to open and start that conversation. Response links resolve the existing
app/tester conversation across revisions. The server derives the founder and tester from the
response, checks both participants' availability, and rejects unrelated users and anonymous tests.
Apply this migration before releasing the submission-card message action.

### Required release verification

Local migration files and fixture browser tests do not prove that the hosted database
has the same behavior. Before marking a chat release complete:

1. Check `supabase_migrations.schema_migrations` for the tester-initiation migration
   and inspect the effective `private.chat_context` and `private.chat_send` definitions.
   Both must derive the participants from the response and allow either participant.
2. Run the database upgrade regression and the My Reviews browser journey at
   390 × 844 and 1440 × 900. Run `npm run ds:check` for the release, retaining any
   unrelated failures in the validation record rather than rewriting visual baselines.
3. Apply only the reviewed migration to the approved target project. Record its actual
   hosted version and align the local filename and test references with that version.
4. In a read-only transaction, call `public.chat_context(response_id, null)` under the
   response tester's authenticated identity. For an available pair without an existing
   conversation, require `id: null`, `canSend: true`, and the owner's peer name. Opening
   the composer must create no conversation, message, or notification job.
5. Verify first send, duplicate-send retry, founder reply, and conversation reuse with
   controlled accounts. Use isolated fixtures or a transaction that is rolled back
   before notification workers can see any test jobs; never message real recipients.

A frontend release with the My Reviews message action is incomplete until the hosted
tester-context check passes. `Try again` cannot repair a missing database migration.

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
4. Enable/verify `pg_net` and Vault. The October 6 background scheduling migration adds
   a transactional outbox trigger for immediate initial dispatch and completion-driven draining.
   Cloudflare's `test4test-background-scheduler` checks for due work every five minutes;
   future reminders and retries retain their original due dates and attempt limits.
   The original minute cron is retained as an inactive rollback option after verified cutover.
   Missing secrets or a failed handoff leave durable work queued. See `docs/auth-availability.md`
   for deployment, health verification and rollback.
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

## My Reviews messaging repair — September 30, 2026

The My Reviews message action was live while production still had the founder-only
`chat_context` and `chat_send` helpers. A read-only call as the affected response's
tester reproduced SQLSTATE `42501`, "This conversation is unavailable." The response,
app, and both available participant profiles existed; there was no prior conversation.

After the owner requested implementation and rollout, the existing tester-initiation
migration was applied alone to project `lteimepkxuiupbcsbcpz` as version
`20261001022459` (October 1 UTC, September 30 in New York). Its original local filename
was `20260923173203_allow_tester_started_conversations.sql`; the SQL is unchanged and
the filename and test reference now match hosted migration history. No frontend,
notification-worker, unrelated migration, or data-backfill deployment was needed.

Production verification confirmed:

- The affected response returns `conversationId: null`, `canSend: true`, and a peer
  name through the public RPC under the tester's authenticated role.
- The check was read-only and the app/tester pair still has zero conversations.
  No verification messages or email jobs were created.
- Both private function bodies match the reviewed SQL; their restricted execution
  grants and empty search paths are unchanged. The security advisor reports no new
  notices compared with the pre-deployment check.

Validation for this repair:

- All 19 focused database/interface tests passed, including the old-to-new upgrade,
  safe migration reruns, permission preservation, first send, retry deduplication,
  founder replies, and outsider rejection.
- The new fixture-only My Reviews browser journey passed at 390 × 844 and
  1440 × 900, including keyboard send, accessibility, reload, founder reply, and
  reuse of the same conversation. Both final screenshots were inspected. These
  tests use controlled fixture accounts and do not certify live email delivery.
- The full release-gate rerun passed formatting, lint (14 existing warnings), types,
  design-system validation, 693 unit tests (one skipped), 77 component tests, and all
  310 browser journey/accessibility checks. An initial payments database startup
  timeout passed in isolation and in that full rerun.
- Visual comparison passed 406 of 416 cases in the full run. Two unrelated button
  stories timed out during page load and both passed targeted reruns, leaving eight
  existing baseline mismatches across the submissions and profile routes at all
  four viewports. This repair changes neither route's rendering. All Messages
  baselines passed. Existing Profile edits and all visual baselines were preserved.
- The production build passed separately after the visual gate stopped.

This repair is **Fast-checked, not Release-validated** because the eight unrelated
visual mismatches remain. The database repair is deployed and its affected production
context is verified. The two prior private helper definitions are saved in the ignored
`.codex-chat-functions-before-20260930.log` for a focused rollback if required; restoring
them would reintroduce the tester-initiation restriction without deleting chat data.
