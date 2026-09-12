# Analytics transcript reports

Recording revisions now use report format version 2 and preserve a separate transcript for
every recording version. See [recording-only tests and revisions](recording-only-revisions.md)
for the updated data model and rollout order. The original release evidence below records
the earlier response-based implementation.

Analytics exports one app's current context and full recording transcripts as a
UTF-8 `.txt` document with Markdown headings. Copy, download, and the read-only
preview share one deterministic formatter. An app is the existing submission ID;
matching app names do not merge records. Reports contain source material only,
with no generated findings or analysis request.

## Format evidence

Official living guides reviewed on September 8, 2026:

- [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering): headings identify hierarchy and delimiters distinguish source content.
- [Anthropic prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices): identify document sources and metadata, and separate documents clearly.
- [Google prompt design](https://ai.google.dev/gemini-api/docs/prompting-strategies): use consistent structure and supply relevant context; questions can follow long source material.
- [Groq speech to text](https://console.groq.com/docs/speech-to-text): the existing Whisper path supports segment and word timestamps with `verbose_json`.

The format is a portable default informed by these sources, not a claim that one
format is optimal for every LLM. Version 1 includes preparation time, coverage,
source notes, current app context/tasks, a recording inventory, and transcript
passages. Context is explicitly current because historical task snapshots are
not stored. Source blocks use collision-safe Markdown fences. No tester profile
details, account emails, signed media URLs, or storage keys are exported. Spoken
personal information is preserved; this feature does not automatically redact it.

Each recording has an export-local R001-style reference and its persistent
response identifier. Transcripts appear once. When full text and timed segments
disagree, full text is preserved with “Timestamps unavailable.” Missing transcripts
remain visible in the inventory and transcript sections. Successful empty results
say “No speech transcribed” and count as completed. Both partial and complete
reports are exportable once any transcript completes.

## Processing and access

- `recording_transcripts` owns status, source fingerprint, retry state, lease, and
  normalized text/segments. `transcript_words` stores ordered timed words.
- A private database trigger inserts pending work when a finalized response gains
  media. Source replacement discards its old transcript and attempt. Source soft
  deletion and account deletion remove transcript data and words.
- `dispatch-recording-transcripts` claims two jobs per invocation and backfills at
  most 25 retained recordings. PostgreSQL claims use `FOR UPDATE SKIP LOCKED`.
- Completed legacy transcripts are reused only when they postdate the current
  recording upload. The import is bounded, idempotent, and uses the same
  attempt-specific completion transaction, including ordered word deduplication.
- `/recordings/transcripts/process` only transcribes audio. It does not extract or
  persist report frames. Worker concurrency is two with at most eight queued/active
  jobs. Duplicate attempt IDs reuse in-flight work.
- `complete-recording-transcript` accepts authenticated worker heartbeat,
  completion, and failure messages. A 15-minute lease is renewed every minute;
  renewal stops after two hours. Lost jobs recover from database state. Automatic
  failures stop after three attempts; owner retry starts a new attempt cycle.
  Queue saturation defers work without consuming an attempt.
- Completion checks the current source and attempt under locks, then writes text
  and words transactionally. Stale, duplicate, and post-deletion results cannot
  overwrite data. Temporary worker media is removed after processing.
- `get-transcript-report` validates the owner and retrieves 50 recordings per
  keyset page using an initial cutoff. The client loads every page before export;
  a failed page never produces a silently truncated report.
- Owner endpoints verify JWTs with `auth.getUser`. Internal endpoints require
  distinct server-held secrets. Service-only RPCs have no public/anonymous or
  authenticated execute grant. Transcript tables also enforce owner RLS.
- The page polls while transcripts are preparing, pauses while hidden, refreshes
  on focus, and clears report state when the app or account changes. No model API
  is called by the report formatter, preview, copy, or download actions.

## Deployment order

1. Apply `20260909011828_recording_transcript_reports.sql`,
   `20260909012639_reuse_existing_recording_transcripts.sql`, and
   `20260909014325_fix_transcript_report_app_context.sql` in order. Validate the RLS,
   trigger, deletion, retry, and pagination tests before production promotion.
   The final migration supports both the legacy `instructions` column and the
   newer optional `instruction_steps` array; it preserves legacy context intact.
2. Deploy the four new Edge Functions: `get-transcript-report`,
   `retry-recording-transcript`, `complete-recording-transcript`, and
   `dispatch-recording-transcripts`. Keep gateway JWT verification enabled for
   the two owner endpoints. The completion and dispatcher endpoints disable the
   gateway JWT check and require their server-held shared secrets inside each
   handler. This internal configuration was explicitly approved for this rollout.
3. Deploy the updated video worker. Retain its existing R2 credentials,
   `WORKER_SHARED_SECRET`, and Groq settings. Set
   `TRANSCRIPT_COMPLETION_WEBHOOK_URL` to the same project's
   `/functions/v1/complete-recording-transcript` endpoint. This callback is required
   for the transcript-only path. Legacy Supabase signed sources must share the
   callback origin and use the storage signing path.
4. In Supabase, retain `VIDEO_PROCESSOR_URL` and
   `VIDEO_PROCESSOR_SHARED_SECRET` matching the worker. Configure a separate
   `TRANSCRIPT_DISPATCH_SECRET`. Store the same value in Vault under
   `transcript_dispatch_secret`; keep the existing `project_url` Vault entry.
   Never place these secrets in client variables or logs.
5. Verify the existing `pg_cron`, `pg_net`, and Vault infrastructure. The migration
   registers `dispatch-recording-transcripts` every minute where available. Without
   the scheduler or Vault secrets, pending work remains durable but does not run.
   If extensions were unavailable during migration, register the minute schedule
   calling `private.dispatch_recording_transcripts()` after enabling them.
6. Use a consented staging recording to verify finalized response → pending →
   processing → ready → preview/copy/download, and verify deletion afterward.
   Then enable the interface release and bounded backfill in the target environment.

## Validation and monitoring

The migration tests run its actual SQL in an isolated PGlite PostgreSQL engine,
with only existing Supabase parent contracts stubbed. They do not certify the
hosted scheduler, real provider credentials, or deployment. Run them with:

```sh
npm test -- tests/unit/transcript-persistence.test.ts tests/unit/transcript-report.test.ts
npm --prefix services/video-processor run typecheck
npm --prefix services/video-processor test
node scripts/run-playwright.mjs a11y --grep "Transcript report|Analytics|analytics (has|reflows|supports)"
npm run ds:check
```

Type-check the four Edge Functions with Deno 2.9.6, setting
`DENO_NO_PACKAGE_JSON=1` so Deno does not resolve the unrelated frontend dependencies:

```sh
deno check --no-config --node-modules-dir=none --no-lock supabase/functions/get-transcript-report/index.ts supabase/functions/retry-recording-transcript/index.ts supabase/functions/complete-recording-transcript/index.ts supabase/functions/dispatch-recording-transcripts/index.ts
```

Release checks on September 8, 2026 (America/New_York):

- 61 unit tests passed, including 30 formatter/persistence tests. The added legacy
  schema regression covers the missing task column found during hosted validation.
- 70 component tests and all 169 accessibility/journey tests passed, including
  exact preview/copy/download equality, partial and silent reports, clipboard
  fallback, app switching, keyboard operation, responsive layout, and playback.
- The exact worker deployment passed a clean dependency install, build, and all
  17 worker tests. All four Edge Functions passed Deno type-checking.
- Application production build, formatting, type-checking, design-system
  validation, and lint passed (19 existing hook dependency warnings).
- All four Analytics visual comparisons passed after updating its accepted
  baselines. Desktop 1440 × 900 and mobile 390 × 844 were inspected, including
  expanded long-report previews.
- The complete `npm run ds:check` gate stopped at visual comparisons: 323 passed
  and 61 failed on other route/story states. These are missing or changed
  baselines, not Analytics failures. Unapproved reference images automatically
  generated by the test runner were removed; the current screenshots remain in
  `test-results`. See [visual review](transcript-release-visual-review.md).

The interface remains **Fast-checked**; the overall release is **not
Release-validated** while the other visual changes await owner acceptance and a
passing full gate. The [design-system skill](../.agents/skills/test4test-design-system/SKILL.md)
requires: “Update affected baselines only after the design-system owner accepts
the visual change, then run the release gate once at finalization.”

## Hosted validation and test account

The three migrations and four endpoints are deployed to Supabase project
`lteimepkxuiupbcsbcpz`. The Render service `test4test-video-processor` runs commit
`18a98237d61380b362fa683f4f915cfdbb0bb82d` from its existing `group-3` branch. Its
transcript callback URL is configured, and the minute dispatcher has matching
Supabase/Vault secrets. Scheduled runs and dispatcher HTTP 200 responses were
verified. The existing legacy report/thumbnail paths remain available.

The authorized test account was already a confirmed, unbanned founder account.
Its two MastoMetrics recordings were retained and playable; both had completed
transcripts in the legacy Supabase tables. Their transcripts were imported into
the new tables. A second cause of the report error was the report query's
assumption that `instruction_steps` existed in the hosted schema; the compatibility
migration corrects it without changing the app's stored context.

The shorter consented test-account recording was then reprocessed through the
deployed dispatcher → Render → Groq → authenticated callback → Supabase pipeline.
It completed on September 9 at 01:51:03 UTC with 35 segments and 612 ordered words.
Both recordings are ready. An authenticated owner API check verified a 9,526-byte
UTF-8 report, two working playback-access responses, owner row isolation, rejected
anonymous/invalid-secret requests, and denied worker RPC access for authenticated
clients. Temporary validation sessions were signed out locally without changing
the account password or ending the user's session. Transcript text was not logged.

Hosted duplicate-callback and soft-deletion cleanup checks also passed inside a
rolled-back transaction: derived rows were removed, post-deletion completion was
rejected, and the original recording/transcript remained intact afterward.
Broader retained-recording backfill is bounded and continues through Cron. At the
01:59 UTC monitoring check, 11 recordings were ready, 10 remained pending, and
two had reached the three-attempt failure limit. Those historical recordings need
separate source/provider investigation. The authorized test account's two
recordings remain ready. The failure controls prevent unbounded retries, and
ready report exports remain available.

No separate staging project was available. The real-provider check used the
user-authorized existing test recording in the connected project; a separate
staging-environment sign-off is still required if enforcing the rollout plan
literally. No real source media or accounts were deleted for validation.

Inspect report views at 390 × 844 and 1440 × 900. Change visual baselines only
after the owner accepts the result. Full release validation also requires the
consented staging check described above.

Monitor counts and age without selecting transcript content:

```sql
select status, count(*), min(created_at) as oldest_created_at,
       min(lease_expires_at) as oldest_lease
from public.recording_transcripts
group by status;

select last_error_code, count(*)
from public.recording_transcripts
where last_error_code is not null
group by last_error_code;
```

Investigate growing pending age, expired processing leases, repeated failures,
and missing dispatcher runs. Callback and provider payloads must not be logged.
To pause rollout, unschedule the named dispatcher and roll back the interface;
retain the additive schema and ready transcripts. Discarding schema is not a
rollback requirement. Resume dispatch after worker/callback configuration is
healthy; the same durable pending work will continue.
