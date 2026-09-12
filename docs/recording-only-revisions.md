# Recording-only tests and recording revisions

All tests use record → upload → Submit test, including old questionnaires and public links.
The existing submission RPC signatures remain valid; new clients send `p_answers: []`.
Owner-authored tasks and previously submitted answers remain stored.

## Persistence and recovery

`test_responses` remains the logical response used for completion counts, credit, and payment
relationships. `test_response_versions` stores the original response and each new recording.
The migration backfills version 1 and moves transcript associations without changing transcript
or word IDs or discarding completed text. Historical ratings are captured before a revision
resets the current rating.

`revise_test_recording` locks the response, checks its author, current rating, live test status,
pending disputes, completed upload ownership, and expected version. Accepted upload retries
return the same version. A rejected transaction preserves the prior response. Pending rating
reports serialize against the same response. The old written-revision RPC is no longer writable
by application users.

Revision recovery is scoped to response ID and expected version. Submitted upload objects
cannot be reclaimed as drafts. Deletion first claims an unattached upload, and a durable queue
retains failed media deletions. Version cascades enqueue original recordings, revisions, and
thumbnails when an account or submission is deleted. Legacy Supabase media remains excluded
from stale-draft cleanup while any retained version references it.

## Playback and reports

The recording viewer defaults to the latest recording. Its selector labels earlier versions
Original, Revision 1, and so on, with dates. Links and playback requests accept an optional
version identity. Without one, existing response links continue to open the latest recording.

Transcript jobs carry a version ID and attempt ID through dispatch and completion. Original
recordings may finish transcription after a revision. Reports and exports contain every retained
recording version and identify its shared response and revision number. Pagination, deltas,
retry controls, and playback caches use version identity. Report format version is now 2.

## Rollout order

This repository change does not itself deploy hosted services. Promote these stages in order:

1. Apply `20260911183111_recording_only_versioned_feedback.sql` after the existing transcript
   migrations. Verify the backfill counts, response/version uniqueness, retained recordings,
   completed transcript text, and owner/tester grants. Keep existing data during rollback.
2. Deploy compatible Edge Functions: `recording-upload-r2`, `cleanup-response-recordings`,
   `get-response-recording-access`, `get-transcript-report`, `retry-recording-transcript`,
   `complete-recording-transcript`, `dispatch-recording-transcripts`,
   `complete-recording-thumbnails`, `enqueue-recording-thumbnail-backfill`, and
   `report-feedback-rating`. The thumbnail backfill also consumes the shared version-aware
   thumbnail helper. Preserve the current JWT and worker/cleanup secret configuration.
3. Deploy `services/video-processor` with version-aware jobs and callbacks. Old queued jobs
   remain compatible: the callback can resolve the version from its unique attempt ID.
4. Verify a consented staging submission and revision, original/revision playback, both
   transcripts, version-specific retry, and account/submission cleanup. Confirm credits,
   payments, and logical response counts have not increased for a revision.
5. Release the frontend only after the backend and worker are ready. The revision route remains
   `/submissions/:responseId/revise`; its final action is Submit revised recording.

## Validation

Migration tests execute the actual migration SQL in PGlite with Supabase parent contracts
stubbed. They cover backfill and completed transcript preservation, permissions, empty-answer
authenticated/anonymous submissions, revision eligibility, optimistic conflicts, accepted-upload
retries, rollback, credit/count preservation, version-specific transcript completion/retry,
55-version pagination/deltas, legacy retention, and queued deletion. This does not substitute
for hosted concurrent-connection, scheduler, provider, and storage verification during rollout.

```sh
npm test -- tests/unit/recording-versions.test.ts tests/unit/recording-submission-flow.test.tsx tests/unit/transcript-report.test.ts tests/unit/recordingPlayback.test.ts
npm --prefix services/video-processor run typecheck
npm --prefix services/video-processor test
node scripts/run-playwright.mjs a11y tests/playwright/microphone-journeys.spec.ts tests/playwright/recording-versions.journeys.spec.ts tests/playwright/transcript-reports.journeys.spec.ts
npm run ds:check
```

Inspect recording, revision, history, and share layouts at 390 × 844 and 1440 × 900. Preserve
visual references until the design-system owner accepts changed layouts. Record release-gate
results before promotion; a failed full gate must not be labeled Release-validated.
