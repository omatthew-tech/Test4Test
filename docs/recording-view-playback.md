# Recording viewer playback recovery

On September 17, 2026, a read-only check of the hosted Test4Test database confirmed
that `public.test_response_versions` did not exist and migration
`20260911183111_recording_only_versioned_feedback.sql` had not been applied.
There were 31 responses with recording paths and no deletion timestamp; this
count does not independently verify their storage objects.

Analyze requested the current recording directly through
`get-response-recording-access`. View recordings first required version history,
then blocked playback when that request failed. This explains the reported
history error despite the same video being playable in Analyze.

The viewer now requests current playback by response ID immediately. Optional
history cannot block or restart that video. Missing-table errors (`PGRST205` and
`42P01`) are treated as unavailable history; other history failures retain a
separate retry. Explicit version links still require that exact version and never
substitute the current recording. Reload video invalidates cached signed URLs.
Navigation and recording replacement discard stale playback results.

This is a frontend compatibility fix. It does not require a database migration,
Edge Function deployment, or transcript changes. The broader revision rollout
still follows [its staged rollout order](recording-only-revisions.md#rollout-order).

Regression coverage lives in `tests/unit/recording-view-playback.test.tsx` and
`tests/unit/recordingPlayback.test.ts`. These exercise the real frontend loaders
against controlled API responses with design-system fixtures disabled. Browser
history/navigation checks live in `tests/playwright/recording-versions.journeys.spec.ts`.
Browser fixture videos verify layout and controls, not media decoding from storage.

## Deployment validation

The approved fix passed 19 targeted playback tests, six recording browser journeys,
the changed-file fast checks, and the production build. The pre-commit release run
also passed formatting, lint (14 existing warnings), type checking, design-system
validation, all 175 unit tests, and all 73 component tests.

The broad browser run encountered the previously documented homepage contrast
failure and outdated homepage free-feedback expectations. It was stopped after
those unrelated failures; the full release gate did not pass. No visual baselines
were updated. This fix is **Fast-checked**, not **Release-validated**.
