# Synchronized recording transcript

The recording page now loads its transcript independently of the video and optional version history. The previous panel always rendered an unavailable message, even when the durable transcript pipeline had already saved text and timed words.

## Display and timing

- The viewer displays approximately four actual wrapped lines. Hidden, inaccessible measurement text uses the same width and typography as the visible passage; resize and font-loading events recalculate the blocks.
- Upcoming words use semantic secondary text; words become primary text at their start timestamp. Completed words remain revealed. Blocks advance at their last word's end, and the last block remains visible at the end of playback.
- The video element's `currentTime` is the only clock. Animation frames sample playback, with React updates only at transcript timing boundaries. Native media events also synchronize pauses, seeking, rate changes, buffering, replay, and replaced video elements.
- Canonical segment punctuation is preserved. An incomplete word alignment uses the whole segment's existing timestamps. A long indivisible segment can scroll within the four-line panel. Text without timing uses a labelled, keyboard-scrollable four-line region.
- Screen readers receive stable full transcript text, without word-by-word live announcements. Text remains selectable. Reduced motion and forced colors are supported.

## API and compatibility

`POST /functions/v1/get-recording-transcript` accepts `{ responseId, versionId? }` and returns `{ transcript }`. A transcript contains `id`, `responseId`, optional `versionId`, `source: { bucket, path }`, `revision`, `status`, `language`, `fullText`, `segments`, and ordered `words`. Each word has `id`, `sequence`, `segmentIndex`, `startMs`, `endMs`, and `text`. An authorized retained recording without a transcript returns `transcript: null`.

The authenticated owner handler verifies the source's submission owner, filters transcript ownership and exact source, retrieves all word pages, then rechecks ownership, source, transcript id, revision, and status. Unauthorized, missing, and deleted recordings return 404; source changes during retrieval return 409. Responses are not cached. Private transcript text and source credentials are never logged.

Current recordings use the existing response source directly, without querying `test_response_versions`. An explicit version must match that exact retained version, or fail closed. No database migration is required. The unrelated recording-version migration remains outside this release.

The retry endpoint first tries the version-aware RPC. Only a missing RPC signature on a response-only request permits retrying the legacy two-argument RPC. Explicit versions and other errors never fall back to another recording.

Preparing transcripts refresh every five seconds while visible. Failures offer separate load/transcription retries. Account, response, version, and source changes discard private state and abort obsolete requests. Neither transcript loading nor retries control the video's source or mounting.

## Validation and rollout

- 40 targeted unit tests cover the transcript viewer/backend and existing recording playback protections, including 1,437-word pagination, owner isolation, source/revision changes, missing history, timing, visibility polling, retries, and stale requests.
- Eight transcript browser journeys pass, including real media-clock playback, seeking, four-line wrapping at 390 × 844 and 1440 × 900, enlarged text, reduced motion, and Axe checks. Six existing recording-version journeys also pass.
- Both Edge Functions pass Deno checks; the production frontend build passes. The changed interface passes the design-system fast check.
- Production endpoints were deployed before the frontend: `get-recording-transcript` version 1 and compatible `retry-recording-transcript` version 3, both with JWT verification enabled.
- The production database was inspected without reading transcript text: 26 ready transcripts have timed words; seven existing failed jobs remain available for an owner-requested retry. No bulk transcription was started.

The complete Tier 3 gate passed formatting, lint (existing warnings only), types, design-system validation, 219 unit tests, and 73 component tests. Its browser stage completed with 219 passed and 12 failures outside the new viewer: homepage contrast/layout expectations, old Analyze/navigation/link labels, Earn preference/paid-preview expectations, and microphone layout/style expectations. The older recording-navigation journey fails on the Analyze page before reaching the viewer because it looks for a renamed link. The new eight transcript journeys and six recording-version journeys all pass in that full run. The failed browser stage prevents the full visual-baseline stage from running; no baselines were updated. This change is **Fast-checked**, not **Release-validated**.

Both deployed endpoints reject unauthenticated POST requests with HTTP 401. A real signed-in recording remains the final production smoke check; local browser tests use a real media element and a local silent WAV with byte-range support.
