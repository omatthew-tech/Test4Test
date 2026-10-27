# Render retirement implementation

Status on October 27, 2026: production cutover complete. Supabase dispatches to
`https://test4test-media-processor.omatthew.workers.dev`, and the Analytics change
is live on `test4test.io`. Render service `srv-d8utum3tqb8s73ev86h0` is suspended;
its dashboard confirms suspended services are not billed. The workspace remains
on free Hobby, with $6.03 already accrued for October before suspension.
Workers Paid is enabled, and the owner confirmed the student-redemption email.

## What changes

- A portable Node/FFmpeg media server retains Groq transcription, private clip
  exports, and limited feedback previews. The existing source-deletion cleanup
  endpoint remains available for old thumbnail objects.
- Cloudflare routes authenticated job references to one `standard-2` container
  (1 vCPU, 6 GiB memory, 12 GB disk), with one native media job executing at a time.
  Liveness, authentication failures, and retired image routes do not wake it.
- This account requires the `durable_object` scheduling policy. The gateway uses
  the native Durable Object Container API with a named, digest-pinned image.
  All jobs use the stable `media` object; the policy has no `max_instances` setting.
- The process closes job admission only when both queues and callbacks are idle.
  A one-minute durable alarm then stops the VM after an authenticated idle
  acknowledgement. SIGTERM alone did not reliably stop the first idle process,
  so the controller calls the native `destroy()` API only after admission closes
  and both queues/callbacks are empty. Failed probes never trigger that stop.
  A six-hour platform inactivity grace protects work across object eviction;
  active alarms keep checking jobs. Prolonged probe failure can continue billing.
- Upload completion and preview reads no longer enqueue thumbnails. The backfill
  endpoint acknowledges retirement. Analytics uses its existing neutral preview
  surface and play control, with no image polling or retry UI.
- Existing authorization, feedback locks, recording deletion filters, durable
  leases, and attempt IDs are retained. No schema changes or stored-media purge.
- Dispatch allows 45 seconds for startup. Network failures and 429/503 use the
  existing busy/retry contract; preparation and permanent HTTP failures still
  use the existing bounded failure policy.

The already deployed `services/background-scheduler` checks Supabase queues every
five minutes. Supabase claims work before contacting the media processor, so an
empty queue does not start a container. The website Worker stays separate.

## Deployment record and validation limits

1. Workers Paid is enabled in account `cdb2bbaa7e9ae5ea5b7ff7848816745b`.
   The owner confirmed the student redemption email on October 27. The offer
   waives the $5 monthly base fee for 12 months, not usage over the included
   allotments. The dashboard has not yet produced an invoice for the upgrade.
   [Student instructions and terms](https://www.cloudflare.com/students/).
2. The Linux image build is now validated. Updating the existing Docker Desktop
   installation from 4.75.0 to the official 4.97.0 release resolved its
   `dockerInference` startup failure. Full Wrangler dry run (including image
   build) passes. The application uses the account's required `durable_object`
   scheduling policy and the native API instead of the older Container helper.
3. Resolve the pre-existing expired design exception
   `supabase-transactional-email-functions` through its owner before claiming full
   release validation. Do not extend its expiry merely to make this migration pass.
4. Live transcription, exports, duplicate admission, capability exchange, range
   playback, a production API request, and shutdown with zero live instances all
   passed before Render suspension. Maximum-size (near 1 GiB) cloud stress tests
   and exhaustive provider-outage simulations were not run. Existing upload
   limits and supported formats are unchanged; local media/recovery tests pass.

## Build and configure

Use Node 22 or later. Run in `services/video-processor`: `npm ci`, `npm run typecheck`, `npm test`, then
`docker build -t test4test-media-processor .`. The Docker image excludes `.env`
files, runs as the unprivileged Node user, and includes native FFmpeg dependencies.
Use an amd64/Linux builder for Cloudflare deployment.

Run in `services/video-processor/cloudflare`: `npm ci`, `npm run typecheck`,
`npm test`, then `npm run deploy` once the account entitlement and builder work.
`wrangler deploy --dry-run --containers-rollout=none` checks only the Worker bundle.

Transfer exactly these existing Render settings into Cloudflare Worker secrets:

- `WORKER_SHARED_SECRET`
- `GROQ_API_KEY`
- `CLOUDFLARE_ACCESS_KEY_ID`
- `CLOUDFLARE_SECRET_ACCESS_KEY`

Read the exported Render environment in memory and stream the selected JSON to
`wrangler secret bulk` through stdin. Do not print secrets, put them in command
arguments, copy the export into the repository, or include them in an image.
Keep Supabase's existing `VIDEO_PROCESSOR_SHARED_SECRET` unchanged. Confirm the
exported model remains `whisper-large-v3-turbo` and source bucket remains
`test-response-recordings`. The legacy thumbnail cleanup bucket is
`usability-test-screenshots`. Callback URLs target project
`lteimepkxuiupbcsbcpz`; those nonsecret settings are in the gateway configuration.
After verification, the temporary Render export was removed from Downloads.
The three downloaded canary MP4s were also removed after validation.

## Validate and cut over

1. Check unauthenticated health, rejected authentication, and retired image routes
   without starting compute. Send an authorized fixture job and confirm startup,
   R2 download, Groq transcript, timestamps, and durable completion.
2. Export and play a clip and a restricted feedback preview. Verify full source
   URLs remain inaccessible to locked viewers. Exercise duplicate dispatch,
   revoked leases, interruption/recovery, and delayed completion callbacks.
3. Measure memory, temporary disk, runtime, and billed lifetime with supported
   MP4/MOV/WebM fixtures, high-resolution VP9, silent video, long chunked audio,
   and inputs approaching the existing 1 GiB limit. Verify work survives longer
   than the one-minute inactivity interval and compute stops after completion.
4. Deploy the changed Supabase functions with their existing JWT settings:
   `recording-upload-r2`, `get-recording-previews`,
   `enqueue-recording-thumbnail-backfill`, `dispatch-recording-transcripts`, and
   `dispatch-recording-clips`, `recording-clips`, and
   `get-response-recording-access` (the latter two import the shared clip dispatcher
   directly or through feedback previews).
5. Change only Supabase `VIDEO_PROCESSOR_URL` to the validated gateway URL, deploy
   the Analytics UI, and observe new transcript/clip attempts completing there.
   Already accepted Render attempts may finish through the same fenced callbacks.
6. Verify no pending/processing Render work or remaining generation callers,
   including scheduled recovery and source deletion. Only then retire Render
   service `srv-d8utum3tqb8s73ev86h0` and confirm no recurring service resources
   remain billable. Suspension preserves a reversible rollback configuration and
   stops compute charges. Already accrued usage is still payable.

## Rollback

Resume the suspended Render service, verify its health, then restore
`VIDEO_PROCESSOR_URL` to `https://test4test-video-processor.onrender.com`.
Resuming reintroduces Render compute charges. Its preserved deployment is commit
`930cb5fc2d97526f59f57fda2e998d1b5795396f` on branch `group-3`, with auto-deploy off.
No schema changes are needed. The metadata-only previews continue to work with
Render; image generation does not need to be restored to recover transcripts.
The service configuration and environment remain available in Render; the service
was suspended rather than permanently deleted.

## Validation record

- Processor typecheck and all 35 tests passed, including native media fixtures,
  queue fencing/recovery, shared execution, authentication, and idle admission.
  The same suite also passed inside the Linux image with external networking off.
- Cloudflare gateway typecheck and five routing/lifecycle tests passed, covering
  concurrent startup, readiness, repeated active-job checks, transient probe
  failures, idle stop, restart, and restoring the inactivity grace after eviction.
  Full Wrangler dry run and Linux image build passed. Live health/authentication,
  retired-route rejection, cold start (about 1.3 seconds), and idle shutdown pass.
- Modified Edge Functions and their affected clip consumers pass Deno check.
  Targeted backend/UI unit tests and 14 dispatch-recovery cases pass.
- Processor dependency pins were updated for AWS S3, Express, and Sharp, plus
  the compatible transitive proxy-addr patch. Production npm audit reports zero
  vulnerabilities; two moderate development-tool advisories remain.
- Root typecheck and production build pass.
- Analytics passes axe and horizontal-overflow checks at 390x844 and 1440x900;
  both screenshots were visually inspected. The standard route command timed out
  loading the app in Vite development mode, so these checks used an isolated build
  with the same development fixtures enabled. No visual baselines were changed.
- Fast-checked: changed-file formatting, lint, and application typecheck passed.
  Both the fast and full design-system commands stop at the existing expired
  `supabase-transactional-email-functions` exception. This is not a complete
  passing validation; the full command also reported existing lint warnings.
- Live canaries used copies of test-account database references; original R2
  recordings and transcripts were retained. Groq returned 428 timestamped words
  with zero invalid time ranges. The long clip ran for over two minutes, surviving
  the one-minute idle checks. It retained 2880x1800 resolution, H.264/AAC codecs,
  and measured 121.797 seconds (63,138,151 bytes). The preview measured 15.005
  seconds (3,228,849 bytes), with the same resolution/codecs. Anonymous capability
  exchange and HTTP 206 range playback passed for both.
- After switching the live Supabase URL, a clip created through the authenticated
  production API completed on Cloudflare in one attempt in about ten seconds.
  Its MP4 measured 3.356 seconds (1,290,343 bytes), with working capability exchange
  and range playback. Metadata previews returned two owned recordings with null
  thumbnails; unauthenticated access returned 401. Backfill returns retired:true.
- Removed the three temporary clips, their derived R2 objects and ledger entries,
  and the temporary canary response/transcript. All three capabilities then
  returned 404. Original transcript completion dates remained unchanged.
- Deployed seven Edge Functions with their existing JWT verification settings.
  `get-recording-previews` remains true; the six other changed/affected functions
  remain false and retain their handler authentication. No schema migration.
- Website deployment `4df93132-11e6-4966-8f9d-dd21f2634a54` was built from HEAD
  plus only the two Analytics files, excluding unrelated working-tree changes.
  The production domain serves that release. Media Worker deployment is
  `8902e51e-8e14-4098-b601-dd59ae0156f8`.
- Both durable media queues were empty before suspension. Render's health endpoint
  now returns 503; the Cloudflare health endpoint and website return 200. Render
  billing lists only the suspended processor, on Hobby, with $6.03 accrued and
  $6.03 projected for October. Prior full months were $7.00.
- The final Cloudflare Containers dashboard showed zero live instances and $0.00
  billable usage in the current period: approximately 7.7k GiB-seconds memory,
  15.41k GB-seconds disk, 174 CPU-seconds, and 0.04 GB egress. These are an observed
  snapshot, not a guarantee that future usage will stay within included allowances.

The subscription initially remained Free after the owner's upgrade attempt,
then changed to Paid and granted Containers access. The billing row continued
to say Processing; the latest visible invoice was October 16 for $0.00. Cloudflare
says invoices can take 24 hours. Student redemption is confirmed by the owner,
not by a new invoice inspected in this session. Do not submit another purchase.
