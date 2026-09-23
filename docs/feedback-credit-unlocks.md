# Earn feedback credit unlocks

New feedback submitted from Earn or an internal Test back action costs the founder one credit when opened. Opening is automatic: there is no confirmation or advance cost label. The debit permanently unlocks the response and all its recording revisions. Shared test URLs remain free, including when the tester is signed in. Responses present when the migration runs are permanently marked `legacy` and remain free.

## Source and ledger

`feedback_source=earn` marks first-party Earn and Test back links. Recording session recovery retains this source; a public slug or `shared=1` always takes precedence as `shared_link`. Unmarked direct visits are free. The submission RPC stamps `test_responses.feedback_source`; a trigger prevents later changes. Existing tester rewards and experiment attribution are preserved.

The authenticated `submit_test_response_from_source` RPC wraps the existing attributed submission transaction. Earn submissions must not fall back to an older submission RPC if this new operation is missing. Public submissions continue using their existing RPC, which stamps `shared_link`.

`open_received_feedback(p_response_id, p_version_id?)` authenticates the founder and validates ownership and retained recording metadata. It returns `free`, `unlocked`, `insufficient_credits`, or `unavailable`. Successful and insufficient-credit outcomes include the authoritative balance. The insufficient-credit result includes an eligible reciprocal submission ID when available, using the reminder flow's eligibility and ordering rules.

The operation locks the founder's profile before reading their ledger. Every ledger insert, update, and delete takes the same account lock. A successful first Earn open inserts a `feedback_unlock` transaction of `-1`. A partial unique index on owner and response prevents repeat charges. No storage or network operation runs while holding the database lock. Temporary media or transcript failures after unlock retain access and never charge again on retry.

## Access boundaries

`list_received_feedback()` supplies owner-scoped summaries for locked recordings without answers, media paths, or thumbnails. The summary retains IDs, submission date, duration, recording presence, and `free`/`locked`/`unlocked` state. Reading lists and reports never spends credits.

Response RLS denies locked rows to founders; recording-history, transcript, and word policies inherit that restriction. Service-role media, thumbnail, transcript, retry, report, and clip operations independently enforce the same entitlement. New public shares and clips require the source feedback to be free or unlocked. Tester playback of their own submission and existing public capabilities remain valid. Report SQL filters before pagination, rather than returning locked transcript text for the browser to hide.

The recording viewer waits for the opening operation before mounting content. Analyze invokes it only on Play. Insufficient credits show a recording preview in the existing player, retaining the response/version query. After the first 15 seconds (or the end of a shorter recording), the player pauses and displays a lock icon, “You're out of credits”, and “Someone tested your app but you haven't tested-back their app”. Earn credits opens `/earn`; Buy credits is visible and disabled until its page is implemented. The separate out-of-credits page and its Test back button are removed. Invalid IDs never fall back to charging for another recording. Unknown balances and failed requests show a retryable error, not an insufficient-credit state.

## Rollout and verification

1. Apply `20260922201543_earned_feedback_credit_unlocks.sql`. It supports both the deployed response-only transcript schema and the local versioned schema; existing rows remain free.
2. Deploy `get-response-recording-access`, `get-recording-previews`, `get-recording-transcript`, `retry-recording-transcript`, and `recording-clips`, including the shared feedback-access helper. Deploy `send-test-back-reminders` with the new source marker. Existing public links are preserved.
3. Verify database grants, RLS, source stamping, ledger constraints, and report filters before deploying the frontend. The frontend requires the new summary and open RPCs.
4. Deploy the frontend only after the required validation. Keep visual baselines unchanged until accepted by the design-system owner.

Focused tests cover balances at/below zero, the last credit, repeat and overlapping opens, version reuse, shared/legacy access, source recovery, invalid/deleted resources, redacted summaries, direct API/database reads, report filtering, and the Earn recovery action. PGlite runs the migration and SQL behavior tests; its single database connection serializes overlapping requests. Mobile and desktop journeys check keyboard behavior, accessibility, content isolation, and layout at 390 × 844 and 1440 × 900.

Operational audit evidence is the credit ledger: each paid response has at most one `feedback_unlock` debit. Access failures must not log transcript text, public share tokens, or signed media URLs. Do not remove unlock transactions as a rollback strategy; disable new Earn-source entry points if a rollout needs to pause while preserving existing entitlements.

## Deployment status — September 22, 2026

### Test-account screen preview

Sign in as the configured test account (`test@test4test.io` locally), then open `/recordings?preview=out-of-credits` and press Play. This route-only simulation plays a 15-second public demo and then shows the in-player lock, even when the account has no recordings. It does not call `open_received_feedback`, request private media, or change credits. Other accounts see a test-account-required message. The old `previewTestBack` option is no longer used.

This preview is available in the local app; it becomes available on the production site when the frontend release below is published.

### Backend and release gate

The backend stage is deployed to Test4Test (`lteimepkxuiupbcsbcpz`). The migration filename matches the applied migration history version `20260922201543`. Deployed function versions: recording access 29, previews 12, transcript 3, transcript retry 5, clips 3, and test-back reminders 35. JWT settings were preserved; public-capability handlers continue to authenticate inside the handler.

Production checks confirmed 163 legacy responses, zero unlock debits, the account-lock trigger and unique unlock index, restricted RPC grants, and the report access filter. A rolled-back legacy open/summary smoke test remained free and left the ledger unchanged. Unauthenticated requests to all five access endpoints returned 401. The security advisor reported no findings for the new feedback functions.

The frontend is implemented and builds successfully, but has not been published. The feature is **Fast-checked**, not Release-validated: the complete `npm run ds:check` attempt stopped at the browser stage with failures elsewhere in the workspace, including homepage contrast/overflow and existing journey expectations. Visual baselines were not updated. Final unit validation passed 604 tests (one skipped); all 77 component tests passed. The new credit-gate journeys passed at both requested viewport sizes. All 13 focused Analyze/recording checks passed across the final reruns, including the previously transient recording-capture browser failure. Resolve the remaining workspace release-gate failures and rerun the full gate before publishing the client.

## Fifteen-second player preview — September 22, 2026

`get-response-recording-access` version 30 adds an authenticated owner-only `preview: true` operation. It resolves the exact response/version and uses the existing durable clip queue to render only the first 15 seconds into a separate private MP4. The original media URL is never returned for a preview. Jobs are idempotent by owner and exact source, keep existing export quotas and cleanup, and issue no public share capability. No database or worker migration is required. Downloads, new shares, full clips, history, reports and transcripts retain their existing access checks.

The client polls pending previews with cancellation and a bounded wait; preparation/playback errors provide Reload video. Seeking cannot continue past the preview boundary. The lock and recovery action remain inside fullscreen and receive keyboard focus when playback ends. Returning after earning retries the original response/version access check. Free and already-unlocked recordings keep the existing full player and feedback tools.

Validation: **Fast-checked**. All 620 unit tests (one skipped), 77 component tests, TypeScript, Deno endpoint checks, design-system validation, the production build, and six desktop/mobile preview and existing clipping journeys passed. A direct check of the existing clip processor exported exactly 15.000 seconds from a 20-second source. The deployed endpoint rejects unauthenticated preview requests with 401. The full `npm run ds:check` passed through component checks, then encountered the existing homepage contrast failure (3.23:1); the broader run was stopped there. No visual baselines were updated and the frontend has not been published.
