# Test4Test recording-first product specification

- Status: canonical product baseline
- Effective: 2026-08-17
- Owner: Test4Test
- Scope: intended production product; implementation and launch remain gated

This specification replaces questionnaire-first product plans for new Test4Test tests. It defines the product that the redesign must implement. It does not claim that the current branch or Test4Test.io already provides every capability below.

## 1. Product promise

Test4Test makes it easy to obtain useful screen-and-voice recordings in three ways:

1. Create a recording test and share its public test link.
2. Complete approved recording tests to earn credits so other community members test your app.
3. Purchase a managed 3-, 5-, or 10-tester package so Test4Test recruits target-matched people from relevant social communities.

Paid recruitment is a human-managed service. Test4Test may use software to help operate the service, but marketing and product copy must not claim that AI finds or recruits participants. Initially, the Test4Test owner performs the recruiting and sends participants to public test links.

## 2. Locked product rules

### Recording-only tests

- A new test contains an app, a public test link, and 1–5 owner-authored task instructions.
- Completing a test requires a screen recording with microphone audio.
- New tests have no questionnaire, AI-generated questions, custom written questions, or written follow-up.
- Public test links remain distinct from public clip links.

### Credits and reputation

- One approved recording earns one test-back credit.
- One credit funds one community test of an owner’s app.
- New accounts receive no starter credit.
- Recording quality is rated optionally from 1 to 5 stars.
- Star ratings contribute to tester reputation and future discovery or moderation decisions.
- Transcript annotations are private research signals. They never change credits or tester reputation.

### Managed tester packages

- Package sizes are fixed at 3, 5, or 10 testers.
- Package prices are configurable and remain a commercial decision before implementation.
- Target audience, requested quantity, price, currency, and fulfillment status must be captured with the order.
- Tester compensation, fulfillment SLA, refund policy, and exact package prices must be approved before checkout launches.

### Retention

- A recording expires 60 days after it is submitted.
- The transcript, timed words, annotations, priority sources, clips, and share access derived from that recording expire with it.
- Owners may delete recordings and clips sooner.
- Deletion or expiration revokes public clip access and removes derived records through a cascading cleanup process.

## 3. Roles and access

### Visitor

- Reads marketing and blog content.
- Opens a public test link and signs in or follows the permitted public participation flow.
- Opens an unlisted clip link without an account.
- Cannot browse recordings, clips, transcript data, or tester identity through storage or database APIs.

### App owner

- Creates and shares recording tests.
- Reviews recordings and timestamped transcripts.
- Marks transcript word ranges useful, not useful, or neutral.
- Creates, shares, and deletes clips.
- Reviews app-level improvement priorities.
- Starts app-level AI conversations with an explicit transcript context mode.
- Rates recordings with optional 1–5 stars.
- Spends earned credits or purchases managed tester packages.

### Tester

- Chooses an eligible recording test or opens a public test link.
- Completes the owner’s tasks while sharing the screen and speaking aloud.
- Uploads the recording and receives one credit after approval.
- Builds reputation from recording star ratings.

### Managed participant

- Is recruited by Test4Test for a paid order and matched to the requested audience.
- Uses the same public test link and recording flow as other testers.
- Does not need access to the owner’s workspace, transcripts, priorities, AI chat, or other recordings.

### Test4Test operator or moderator

- Recruits managed participants, monitors orders, handles retries, and reviews reports.
- May approve, reject, or investigate recordings under explicit privileged access.
- Must not receive broad client-side access to private media or bypass owner isolation through public APIs.

## 4. Information architecture

### Public

- Home
- How it works
- Pricing or managed tester packages
- Blog
- Public recording-test link
- Public clip link
- Sign in and account creation

### Authenticated owner workspace

- Apps
  - App overview
  - Test setup and share link
  - Recordings
  - Recording detail and transcript
  - Improvement priorities
  - AI conversations
  - Managed tester orders
- Earn
- Credits and reputation
- Account and privacy controls

The app is the primary research container. Recordings, priorities, and AI conversations are grouped by app rather than isolated test submissions.

## 5. Complete product flows

### A. Create and share a recording test

1. The owner names or selects an app and supplies its destination link.
2. The owner writes 1–5 ordered task instructions.
3. Test4Test validates that a recording with microphone audio is required.
4. The owner publishes the test.
5. Test4Test creates an opaque public test link.
6. The owner copies or shares that link with community or independently recruited participants.

Editing tasks must not introduce a questionnaire. Existing legacy questions may remain visible only when reviewing an old record that already contains them.

### B. Complete a test and earn a credit

1. A tester opens an eligible test from Earn or a public test link.
2. The tester reviews the tasks and recording/privacy notice.
3. Preflight checks screen-capture support and microphone permission.
4. The tester starts the screen-and-voice recording and completes the tasks.
5. Test4Test uploads, finalizes, and verifies the recording with visible retry and recovery states.
6. The recording is approved automatically or through moderation rules.
7. The tester receives one credit exactly once.
8. The app owner may leave an optional 1–5 star rating.

Rejected, duplicate, empty, inaccessible, or policy-violating recordings do not earn credits. Annotation colors do not affect the approval outcome.

### C. Process and review a recording

1. A finalized recording enters transcript status `pending`.
2. Processing produces timestamped segments and exact timed words.
3. Successful processing changes status to `ready`; errors change it to `failed` with a safe retry path.
4. The owner watches the recording and reads the synchronized transcript.
5. Selecting transcript words seeks or previews the matching time.
6. The owner may mark exact word ranges yellow, red, or unmarked.
7. The owner may recolor, resize, or remove a selection without overlapping incompatible annotations.

Every recording must expose transcript state in text, including pending, ready, failed, retrying, and unavailable after deletion or expiration.

### D. Review app-level improvement priorities

1. Test4Test collects yellow annotations from every unexpired recording for the app.
2. It groups semantically related findings into themes.
3. It ranks themes by recurrence and supporting evidence, while keeping the ranking method explainable.
4. Each theme links to every source recording, annotation, and timestamp.
5. Removing or recoloring a yellow annotation removes it from the next priority calculation.

No theme may be presented as evidence unless it can be traced to at least one current yellow source.

### E. Create and share a clip

1. The owner chooses an exact start and end time within a recording.
2. The editor previews the video range and matching transcript excerpt.
3. The owner supplies a clip title and creates an opaque, unlisted share token.
4. Anyone with the link may see only the clip, app name, clip title, and transcript excerpt.
5. The public page never identifies the tester or exposes the rest of the recording.
6. Deleting the clip revokes access immediately. Deleting or expiring the source also makes the link unavailable.

### F. Chat with app research

1. The owner starts or opens an app-level AI conversation.
2. A visible context selector offers `yellow only`, `yellow plus unmarked`, or `all content including red`.
3. New conversations default to `yellow plus unmarked`.
4. The server builds model input from current, unexpired transcript words that match the selected mode.
5. Excluded text is filtered before the model request and is never sent to the model.
6. The answer links claims back to available recordings and timestamps when possible.

Changing modes affects later messages and must be recorded with the conversation. The interface must not suggest that a context choice changes transcript storage or annotation privacy.

### G. Purchase a managed package

1. The owner chooses 3, 5, or 10 testers and supplies audience criteria.
2. Checkout displays the configured price, currency, service scope, expected timing, refund terms, and consent language.
3. A successful payment creates a managed order tied to the app and public test link.
4. A Test4Test operator recruits target-matched people from relevant social communities.
5. Participants complete the standard recording flow through the public link.
6. The owner tracks ordered, recruited, submitted, accepted, replacement-needed, fulfilled, canceled, or refunded status.

Managed participants are not represented as AI agents, bots, or simulated users.

## 6. Transcript and annotation behavior

### Transcript requirements

- Every recording has one canonical transcript attempt state and zero or one ready transcript version.
- A ready transcript contains full text, language, duration, provider/model metadata, segments, and ordered timed words.
- Each word has a stable sequence, start time, end time, and text.
- Retry attempts are idempotent and must not create duplicate active transcripts or words.
- Owners can retry failed processing without re-uploading a valid source recording.

### Annotation requirements

- Yellow means useful.
- Red means not useful.
- Unmarked means neutral.
- An annotation is an inclusive exact word range within one transcript.
- Yellow and red ranges are mutually exclusive at every word.
- A resize or recolor is transactional: the saved result must never contain an overlap forbidden by the rules.
- Timestamp boundaries are derived from the selected words and stored for fast playback and historical traceability.

## 7. AI context privacy

The three visible modes map to allowed transcript words as follows:

| Mode                      | Included                       | Excluded               |
| ------------------------- | ------------------------------ | ---------------------- |
| Yellow only               | Yellow words                   | Unmarked and red words |
| Yellow plus unmarked      | Yellow and neutral words       | Red words              |
| All content including red | Yellow, neutral, and red words | None                   |

Filtering is a server-side privacy boundary, not a client convenience. The model gateway receives only allowed text plus the minimum metadata needed for source links. Logs, traces, caches, retries, and evaluation payloads must apply the same exclusion rule.

## 8. Public clip privacy and media access

- Recording media remains private.
- Public pages never receive bucket credentials or a permanent bucket URL.
- A revocable token endpoint hashes and validates the opaque clip token, clip status, source ownership state, and expiration.
- A valid request returns only public clip metadata and a short-lived private-media URL limited to the clip playback path.
- Raw share tokens are not stored after creation; only a one-way hash is stored.
- Revocation is checked on every token exchange so deleting a clip takes effect immediately even if a prior media URL remains valid for its short lifetime.
- Rate limits, abuse monitoring, safe error responses, and non-indexable page metadata are required.

## 9. Retention, deletion, and consent

- Before capture, testers see what is recorded, who can review it, transcript processing, public-clip behavior, and the 60-day retention period.
- The product must warn testers not to expose secrets, personal messages, payment data, or unrelated private content while sharing their screen.
- Recordings, thumbnails, report frames, transcripts, annotations, priority sources, clips, and share records share one source expiration boundary.
- Cleanup must be idempotent, observable, retryable, and safe when storage deletion partially fails.
- Database rows use cascading ownership relationships where appropriate; object cleanup is queued and verified separately.
- Owner deletion and account deletion must cover media and all derived data.
- Operational logs must not contain transcript text, share tokens, signed media URLs, or recording credentials.

## 10. Conceptual data contracts for future implementation

These contracts define product intent, not an applied migration. Names may change during schema review if behavior remains equivalent.

### `recording_transcripts`

- `id`, `response_id`, `owner_user_id`
- `status`: `pending | processing | ready | failed`
- `provider`, `model`, `language`, `duration_ms`, `full_text`
- `attempt_count`, `last_error_code`, `retry_after`, `processed_at`
- `created_at`, `updated_at`, `expires_at`, `deleted_at`
- One active transcript per response; retries update a durable attempt state.

### `transcript_words`

- `id`, `transcript_id`, `sequence`
- `start_ms`, `end_ms`, `text`, optional `segment_index`
- Unique `(transcript_id, sequence)` and ordered time constraints.

### `transcript_annotations`

- `id`, `transcript_id`, `owner_user_id`
- `kind`: `useful | not_useful`
- `start_word_id`, `end_word_id`, `start_ms`, `end_ms`
- `created_at`, `updated_at`, `expires_at`
- A database-backed exclusion rule prevents overlapping yellow/red coverage.

### `improvement_priorities` and sources

- Priority: `id`, `submission_id`, `title`, `summary`, `rank`, `support_count`, `generated_at`, `expires_at`
- Source: `priority_id`, `annotation_id`, `response_id`, `start_ms`, `end_ms`
- Sources cascade when annotations or recordings are removed.

### `recording_clips` and `recording_clip_shares`

- Clip: `id`, `response_id`, `owner_user_id`, `title`, `start_ms`, `end_ms`, `transcript_excerpt`, `expires_at`, `deleted_at`
- Share: `id`, `clip_id`, `token_hash`, `status`, `created_at`, `revoked_at`, `expires_at`
- Start/end constraints keep clips inside the source duration.

### `recording_ratings`

- `id`, `response_id`, `rated_by_user_id`, `tester_user_id`, `stars`, `created_at`, `updated_at`
- `stars` is constrained to integers 1–5.
- One owner rating per response.

### `ai_conversations`

- `id`, `submission_id`, `owner_user_id`, `context_mode`, `created_at`, `updated_at`
- `context_mode`: `yellow_only | yellow_and_unmarked | all`
- The mode used for each model request is retained for audit without storing excluded prompt text.

### `managed_test_orders`

- `id`, `submission_id`, `owner_user_id`, `package_size`
- `price_amount`, `currency`, `audience_criteria`, `terms_version`
- `status`, `payment_reference`, `placed_at`, `fulfilled_at`, `canceled_at`, `refunded_at`
- `package_size` is constrained to 3, 5, or 10; price and terms are captured at purchase.

## 11. Database and service requirements

- Timestamped migrations in `supabase/migrations` are the only authoritative schema setup path.
- Every owner-scoped table uses ownership-based RLS. `anon` receives no base-table access for private research data.
- Data API privileges are granted explicitly and minimally; RLS is not a substitute for grants.
- Columns used by foreign keys, ownership policies, status queues, expiration jobs, and token lookups are indexed for their actual query patterns.
- Authentication functions in RLS policies are evaluated once per statement where possible.
- Privileged helpers live outside exposed schemas, set a safe `search_path`, verify the caller, and revoke unnecessary execute access.
- Public clip access goes through a server endpoint with a service credential and never a broadly executable database function.
- Transcript jobs, cleanup jobs, order fulfillment, and token revocation are observable and retry-safe.
- Private media uses short-lived access URLs; signed URLs are delivery credentials, not the revocation system.

## 12. Current implementation status

### Partly or substantially working

- Recording-only creation currently captures an app, links, and 1–5 owner-authored instructions.
- Screen and microphone capture, upload recovery, playback, recording access, and private thumbnail work exist.
- Public test links exist.
- Credit earning and removal of starter credit are partly represented in current migrations and flows.
- The video worker can generate timestamped transcript data while building a report.
- Recording storage has a 60-day retention migration.

### Incomplete or missing

- Durable transcript persistence and a synchronized transcript viewer.
- Processing status, owner retry, and idempotent transcript job orchestration.
- Exact word-range yellow/red annotations and overlap enforcement.
- App-level improvement-priority generation and source traceability.
- Clip editing, public clip tokens, revocation, and range-limited playback.
- AI chat and server-enforced context filtering.
- Optional 1–5 star recording ratings and tester reputation updates.
- Managed package pricing, checkout, order operations, compensation, SLA, and refund behavior.
- Complete RLS, grants, cleanup, and private-media policy for all future derived entities.

### Launch blockers already visible in the application

- Homepage copy describes recruiting “cyborgs” or AI, which conflicts with the human-managed recruitment policy.
- Tester marketing includes paid-tester earnings claims that are not part of the approved credit model.
- Purchase, share, and chat controls are disabled or placeholders rather than complete workflows.
- Legacy questionnaire, question-generation, question/answer persistence, face-rating, and revision code remains in the repository.
- Recording detail currently reports that a transcript is unavailable instead of providing the required lifecycle and viewer.

These blockers are recorded here for later implementation. This documentation phase does not change those interfaces.

## 13. Migration and compatibility requirements

- Preserve legacy question and answer tables temporarily so existing records remain readable.
- Mark those tables and AI-question functions non-canonical for new tests; do not invoke them from the new creation flow.
- Migrate legacy recording satisfaction values as `frowny → 1`, `neutral → 3`, and `smiley → 5`.
- Make star migration idempotent and preserve the original legacy value for audit until the migration is accepted.
- Backfill transcript jobs only for unexpired, accessible recordings and record failures without blocking unrelated recordings.
- Derive all new expiration timestamps from the source recording rather than adding a fresh 60-day clock.
- Existing public test links remain valid unless separately revoked.
- No legacy recording becomes publicly shareable merely because clips are introduced.

## 14. Future design-system needs

Implementation will require reviewed, typed design-system support for:

- synchronized transcript viewer and timed-word selection;
- yellow/red annotation controls and selection state;
- clip range editor and public clip presentation;
- 1–5 star rating input and read-only presentation;
- app-level priority groups with source evidence;
- AI context selector with clear inclusion language;
- transcript processing, retry, expiration, and unavailable states; and
- managed-order status presentation.

No new component is authorized by this specification alone. Each reusable component still needs a catalog entry, contract, examples or stories, accessibility behavior, tests, responsive validation, and semantic tokens.

## 15. Non-goals for the recording-first product

- New questionnaires, surveys, AI-generated questions, or written follow-up answers.
- AI agents pretending to be recruited human participants.
- Using transcript usefulness annotations to punish testers or change credit awards.
- Public recording libraries, permanent public media URLs, or discoverable clip indexes.
- Permanent recording or transcript storage.
- Unlimited free managed recruiting.
- Publishing exact prices, compensation, SLA, or refund promises before those decisions are approved.

## 16. Future launch gates

### Product and commercial gate

- Approve package prices, tester compensation, fulfillment SLA, refund policy, replacement rules, and public claims.
- Replace AI/cyborg and paid-tester-earnings copy with truthful product language.
- Confirm consent, privacy, moderation, and deletion wording.

### Data and service gate

- Review and apply migrations for transcripts, words, annotations, priorities, clips, ratings, AI conversations, and managed orders.
- Verify RLS, explicit grants, indexes, cascade behavior, token hashing, retry safety, and 60-day cleanup.
- Prove private media cannot be enumerated and public clips reveal only the approved range and metadata.
- Complete backup, monitoring, error reporting, and operational runbooks.

### Interface gate

- Implement and test every future interface in Section 14.
- Remove questionnaire-first creation from the canonical path while preserving legacy reads.
- Validate keyboard, screen-reader, mobile, desktop, reduced-motion, forced-colors, loading, empty, failed, retry, delete, and expired states.
- Validate at 390 × 844 and 1440 × 900 and pass the design-system checks.

### Release gate

1. Deploy a preview from the redesign branch without changing the production domain.
2. Run product, accessibility, security, privacy, media, payment, and migration validation against the preview.
3. Obtain explicit approval to promote the reviewed branch to the production branch.
4. Build and deploy the promoted production commit.
5. Complete smoke tests before pointing or confirming Test4Test.io traffic.
6. Monitor auth, capture, uploads, transcript queues, clips, orders, cleanup, and rollback signals.

Until these gates pass, the current redesign branch must not be described as the production Test4Test.io application.

## 17. Decisions still required

- Exact price for each 3-, 5-, and 10-tester package.
- How managed participants are compensated.
- Fulfillment SLA and replacement threshold.
- Refund and cancellation policy.
- Recording approval and dispute rules.
- Priority-ranking methodology and when AI may assist with grouping.
- Model provider, regional processing, and transcript subprocessors.

These decisions are explicit prerequisites, not implementation details to infer silently.
