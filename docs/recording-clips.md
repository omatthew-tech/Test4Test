# Recording clips

The recording viewer now provides Clip, draggable start/end handles, keyboard
adjustment, preview, and Save clip. The initial range starts at the current
playback position and extends up to 30 seconds. Save opens a popup; after the
server acknowledges the request, it shows a stable link with Copy link. The
popup and guest page show progress until the separate MP4 is ready.

## Media and permissions

The exported video uses H.264/AAC MP4, accurate cuts, optional original audio,
stripped source metadata, and progressive playback. It is stored privately in
the recording R2 bucket under recording-clips. Existing MP4, MOV, and WebM
recordings, including legacy Supabase storage and exact versions, are supported.

Authenticated owners and testers can create clips of recordings they can access.
Only the creator can inspect job status, retry, or delete their clip. Guests use
`/clips/shared#<token>` without an account. The token contains 256 random bits;
only its SHA-256 hash is stored. Public responses contain the product name, clip
duration/status, and five-minute URLs for only the exported MP4. They never
return the original recording, tester identity, transcript, or storage credentials.

The database tables have RLS enabled and no guest or authenticated-client grants.
Job RPCs are restricted to the service role. Clip creation is idempotent and
bounded to three unfinished exports and twenty new clips per creator per hour.
Ranges must be at least 100 ms and end within 24 hours. The worker verifies the
actual source and output duration independently.

Postgres stores pending/processing/ready/failed state. Row-lock claims, renewable
leases, attempt IDs, three automatic attempts, and bounded manual retries recover
worker restarts. The worker bounds local concurrency and source/encoding/upload
resources. Decoder, filter, and encoder threads are explicitly limited, and the
encoder disables lookahead buffering to fit the existing 512 MB Render instance
while preserving source resolution. Only approved storage origins/buckets and
media formats are accepted.

Deleting the clip, source, or account prevents new token exchanges. Replacing a
current recording invalidates its clips; version clips remain tied to their
original source. Previously issued URLs can remain usable for five minutes;
downloaded copies cannot be recalled. Every potential output is recorded before
dispatch. A durable ledger cleans deleted and superseded files after one hour,
longer than the worker's 15-minute deadline. Failed storage deletion is retried.

## Rollout

The database, Edge Functions, and Render worker are deployed. Actual export,
guest playback/download, revocation, and storage cleanup have been verified.
The production frontend release remains separate and is not deployed by this rollout.

1. Apply `20260920185754_recording_clips.sql`. It supports the original recording
   schema as well as recording versions; deploying versioning is not a prerequisite.
   If versioning is deployed later, the final block in its migration installs the
   clip version foreign key and revocation trigger. Both migration orders are tested.
2. Deploy the three new functions: `recording-clips`, `complete-recording-clip`,
   and `dispatch-recording-clips`. Their committed `verify_jwt = false` settings
   require the session, capability, and shared-secret checks in their handlers.
3. Keep the existing Supabase worker URL/secret, R2 recording credentials, and
   `TRANSCRIPT_DISPATCH_SECRET`. The scheduler reuses Vault's `project_url` and
   `transcript_dispatch_secret` with pg_cron and pg_net.
4. Deploy the updated video processor with `CLIP_COMPLETION_WEBHOOK_URL` set to
   the project's `/functions/v1/complete-recording-clip` URL. Its shared secret
   must match Supabase. Source R2 credentials need GetObject, PutObject, DeleteObject.
5. Confirm the `dispatch-recording-clips` cron job runs each minute. Save also
   dispatches immediately; cron handles recovery and cleanup after the editor closes.
6. Deploy the frontend after the backend dependencies. In preview, verify actual
   retained recordings: save, copy, open in a signed-out browser, play/download,
   retry failure, delete the source, and confirm link revocation and eventual
   storage cleanup. Production promotion is separate from local implementation.

## Hosted backend status — 2026-09-20

Supabase project `lteimepkxuiupbcsbcpz` has the clip migration and all three
functions deployed. The local migration filename matches the version recorded
by the hosted migration tool. The existing worker/R2/dispatcher secrets are
present; no unrelated migrations or functions were deployed for this rollout.

The minute cron job is active, and a direct scheduler dispatch returned HTTP 200.
Anonymous creation, invalid capability links, and unauthenticated worker and
dispatcher requests returned 401/404 as expected. Both clip tables have RLS and
no anon/authenticated access; all five public job RPCs reject those roles.
A rolled-back transaction verified creation, claims, duplicate completion,
stale callback rejection, source revocation, and retained cleanup records. No
source recording or transcript was changed by those checks.

Security advisors reported only the expected no-policy notices for the two
service-only clip tables; no new clipping security warnings were found. Existing
project advisories are outside this change. See Supabase's
[RLS no-policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The isolated worker release is published on `codex/recording-clips-worker` at
`930cb5fc2d97526f59f57fda2e998d1b5795396f` and is live on
[`test4test-video-processor`](https://dashboard.render.com/web/srv-d8utum3tqb8s73ev86h0/deploys/dep-dao3ot3m8hqs73d5g680).
A clean dependency install, production build, and all 29 worker tests passed.
It preserves the existing Render worker code and contains only clipping changes
and documentation. `CLIP_COMPLETION_WEBHOOK_URL` is configured; the existing
worker secret and R2 configuration were preserved. Render disabled Auto-Deploy
when the specific commit was selected. Keep the service pinned until this worker
release is incorporated into its configured `group-3` branch.

The first real export exposed FFmpeg's automatic thread allocation exceeding the
Starter instance's 512 MB memory limit. The deployed fix bounds all media threads
and disables encoder lookahead. A regression test exports full-resolution VP9.
The same durable job was successfully retried after deployment without increasing
the instance size or reducing recording resolution.

A test-account 2880 x 1800 VP9 WebM was clipped from 1.230 to 4.560 seconds.
The resulting 1,290,343-byte MP4 is 3.356 seconds, retains 2880 x 1800 resolution,
and uses H.264 video, AAC audio, and fast-start metadata. Idempotent creation,
owner retry, unauthenticated capability exchange, ranged download, and actual
browser playback to completion passed. Browser playback used the local frontend
with fixtures disabled against the hosted backend; the production website does
not yet include the clip route.

The temporary clip was deleted through the owner API, and guest exchange then
returned 404. Only its completed test-attempt cleanup records were aged past the
one-hour grace period to verify the dispatcher removed the derived R2 objects
and ledger entries. No original recording or transcript was modified.

## Validation

The unit tests in `tests/unit/recording-clips*` exercise the real migration in
PGlite, actual Edge handler with controlled storage/auth responses, and editor
behavior. They cover access control, idempotency, leases, stale completion,
cleanup, quotas, clipboard denial, retries, and navigation. Worker tests export
synthetic MP4/MOV/WebM with and without audio, check codec/duration/fast-start, and
verify that the first output pixel excludes footage preceding a non-keyframe cut.

The TimelineRange Storybook contract covers keyboard boundaries and disabled
state. The clipping browser journey covers dragging, keyboard adjustment, save,
copy, guest viewing, and accessibility at 1440 x 900 and 390 x 844. Browser
fixtures test the interface; worker tests exercise actual media encoding.
Screenshots are under `output/validation/recording-clips`. No baselines were updated.

Validation on 2026-09-20: **Fast-checked**. All 28 focused clip unit tests, 12
clip worker tests, the timeline interaction contract, both responsive browser journeys,
application/worker type checks, Deno endpoint checks, and the production frontend
build pass. Actual export coverage includes browser-style WebM without duration
or seek cues. The full gate passed formatting, lint (existing warnings), types,
design-system validation, 472 then-current application tests, and 75 component
tests. After resolving a preview port collision, the broad browser stage passed
164 checks and stopped at three existing homepage failures: contrast and two
outdated free-feedback heading assertions. The remaining browser/visual release
checks are not established by this local validation. Hosted backend deployment
and verification are recorded separately above.

There is no persistent clip library in this change. Copy the link before leaving
the editor; existing links continue working independently of the editor session.
