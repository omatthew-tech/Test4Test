# Recording upload latency investigation — 21 September 2026

The reported session exposed repeatable application bottlenecks and misleading
progress. The available evidence does not establish which network/service hop
caused the full incident, or implicate Chrome extensions, the computer, or the
Supabase free plan.

## Production evidence (read-only)

For test `24aec9dc-d4d4-4805-979d-9bc7a2a38d76`, the submitted recording was
28,265,469 bytes (27.0 MiB), uploaded directly to Cloudflare R2 as one object.
Supabase stores the upload metadata and accepts the final test submission.

| Saved event             | UTC time     |
| ----------------------- | ------------ |
| Upload session created  | 15:49:36.134 |
| Upload marked completed | 15:51:12.963 |
| Test response submitted | 15:52:28.119 |

Creation to upload confirmation took 96.829 seconds. Another 75.156 seconds passed
before the response was submitted. These timestamps do **not** record when the
browser reached 100%, when Submit was clicked, or when the response reached the
browser. The second interval includes any time the tester spent before clicking.
They cannot distinguish transfer time, R2 acknowledgement, auth, Edge Function
latency, and the subsequent browser refresh.

The available `pg_stat_statements` samples show test submission query means of
144–222 ms and maxima of 236–310 ms (2–6 calls per query shape). Upload metadata
upserts averaged 31 ms and peaked at 61 ms. These are database execution times,
not end-to-end request times or incident-specific traces.

The project's reported status was `ACTIVE_HEALTHY`. Read-only auth probes run
from this computer returned 414 ms for health, 381 ms for provider settings, and
80 ms for preflight. These establish current health only, and bypass Chrome and
its extensions. No production data, settings, or account plan was changed.

## Changes

- The upload page and floating recorder distinguish bytes sent from confirmation
  that the recording is saved. Submit still requires successful confirmation.
- Once all bytes have been sent, a storage acknowledgement that stalls for 30
  seconds exposes recovery instead of leaving the page indefinitely at 100%.
  Metadata requests also have a 30-second deadline, including session retrieval.
  This does not impose a 30-second limit on the video transfer itself.
- Retrying a single-object metadata confirmation reuses an acknowledged PUT, so
  the browser does not resend the recording. The native recording blob remains
  available for retry or backup download after a timeout.
- The same **Already recorded?** disclosure used in setup now appears during
  upload. Its file input remains disabled while the current upload is active to
  prevent competing uploads; timeout/failure exposes the existing recovery form.
  A backup can also be downloaded from the main upload page while it waits.
- Thumbnail lookup and processing run as background work after required upload
  confirmation. A thumbnail lookup failure cannot turn a saved video into an
  apparent upload failure.
- Multipart completion retries verify the same owned draft and upload ID. An
  already-completed draft succeeds without completing the consumed ID again. If
  R2 completed the object but the metadata write/reply was lost, recovery still
  requires a successful HEAD verification before marking it complete.
- Test submission and revision return the committed RPC result without waiting
  for the unrelated application-data refresh. Navigation refreshes the destination.
- `/test/:reference` loads the requested ID or share slug and its versions instead
  of all visible tests. It skips unrelated ratings, credits, and received responses,
  while retaining authored-response history and relevant closed-test participation.
  RLS, ownership checks, route URLs, and submission contracts remain in place.

## Validation and rollout

This is Tier 3 because it changes shared loading and submission behavior. The
interface uses the existing route composition and design-system exports; no new
tokens, reusable components, or visual baselines were added.

Fast design-system checks and 45 targeted unit tests passed. New upload-screen
checks passed at 390 × 844 and 1440 × 900, including keyboard focus, overflow,
accessibility, confirmation messaging, and Submit remaining locked until success.
The recording journey suite passed 11 checks; two unrelated setup-style assertions
failed (link color and a one-pixel label-spacing difference).

The full gate passed formatting, lint (warnings only), TypeScript, design-system
validation, 538 unit tests (one skipped), and 77 component tests. Its browser stage
finished with 278 passing and 14 failing checks outside the changed upload flow:
homepage contrast/reflow and older content expectations, Analytics/recording-link
expectations, Earn fixtures/preferences, and the two setup-style assertions above.
The visual-baseline stage was therefore not reached. A comparison using original
route code timed out during preview startup, so it did not independently establish
the original result for the two style assertions. No baseline was changed.

The final upload checks separately passed at both required sizes, including
ensuring the floating recorder grows to fit confirmation copy. The production
build and Deno type-check passed. Handoff status: **Fast-checked**, not
Release-validated because the full gate is not green.

The changes are local and not deployed. Deploy `recording-upload-r2` before the
frontend so multipart confirmation recovery is available with the new deadlines.
No database migration or plan upgrade is required. Historical cause remains
uncertain; real production timings after deployment are needed to quantify the
latency improvement.
