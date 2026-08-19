# Recording-first product workflows

The canonical business behavior is defined by [`../../usability_platform_product_plan.md`](../../usability_platform_product_plan.md). This pattern guide translates that behavior into future interface requirements. It does not authorize implementation by itself.

All workflows use exports from `@test4test/design-system`, semantic tokens, explicit text states, keyboard operation, focus management, and responsive composition. Legacy question editing, written answers, face ratings, and revision-question patterns may remain only for existing records.

## Create and share a test

- Use a visible heading and a short, persistent-draft flow for app details, destination links, and 1–5 ordered task instructions.
- State that screen and microphone recording are required before publishing.
- Do not offer questionnaire, AI-question, custom-question, or written-follow-up modes for a new test.
- After publishing, show the public test URL in a labelled read-only field with copy feedback in a live region.
- Keep public test sharing visually and semantically distinct from public clip sharing.

## Earn and record

- Represent eligible tests with canonical rows, badges, and status indicators.
- Explain the exchange accurately: one approved recording earns one credit; there is no starter credit.
- Move through explicit preflight, microphone permission, screen-share permission, active capture, finalizing, uploading, retry/recovery, processing, and completion states.
- Use text and live regions for every state change. Do not rely on color, animation, waveform motion, or progress alone.
- Before capture, disclose the 60-day retention period, transcript processing, owner review, and safe screen-sharing guidance.

## Recording and transcript review

- Keep video, playback time, transcript position, and exact timed-word selection synchronized.
- Expose `pending`, `ready`, `failed`, `retrying`, `expired`, and `deleted` transcript states in text.
- Yellow means useful, red means not useful, and unmarked means neutral.
- An annotation control must support exact word ranges, recoloring, resizing, and removal while preventing incompatible overlaps.
- Color is never the only indicator: announce the annotation label and selection boundaries to assistive technology.
- Preserve a stable return point when moving from a transcript timestamp to another recording or priority source.

The current `ResponseViewer` and `RatingControl` document v1 behavior. They are not sufficient contracts for the synchronized transcript viewer or 1–5 star rating required by the recording-first product.

## Improvement priorities

- The page is scoped to one app and combines yellow annotations across all unexpired recordings for that app.
- Present ranked themes with recurrence or support information and expandable source evidence.
- Every finding links to its recording and timestamp; a theme without current source evidence must not be shown as fact.
- Clearly distinguish generated grouping or summary text from the owner’s original highlighted words.
- Loading, no-yellow-highlights, no-recurring-themes, processing, partial failure, stale, and regenerated states require explicit presentations.

## Create and share a clip

- A clip editor provides exact start/end controls, keyboard-adjustable range boundaries, a bounded video preview, and the matching transcript excerpt.
- Validate that the range is non-empty and inside the source recording.
- The share dialog contains a labelled unlisted URL, copy feedback, revocation language, and the source expiration date.
- The public clip view shows only the selected range, app name, clip title, and excerpt. It omits tester identity and navigation to the rest of the recording.
- Deleted, revoked, expired, invalid-token, media-processing, and temporarily unavailable states do not reveal whether other private recording data exists.

## AI conversations and context selection

- AI conversations are scoped to one app.
- A visible context selector offers `Yellow only`, `Yellow + unmarked`, and `All content including red`.
- New conversations default to `Yellow + unmarked`.
- Supporting text explains what will be sent, not just what will be hidden in the interface.
- A context change is announced and applies to later messages; it does not silently resend earlier excluded text.
- Source links return to the matching recording and timestamp when available.

## Rate a recording

- Use an optional 1–5 star input with a clear group label and an accessible name for every value.
- Support arrow-key navigation and an explicit way to clear an optional rating.
- Explain that stars inform tester reputation. Do not imply that yellow/red transcript annotations affect the tester, the credit award, or reputation.
- Legacy face values render through the approved mapping: frowny 1, neutral 3, smiley 5.

## Managed tester packages

- Present 3-, 5-, and 10-tester choices without invented prices or fulfillment promises.
- Checkout must show configured price, currency, audience criteria, service scope, expected timing, refund terms, and confirmation before payment.
- State plainly that Test4Test recruits real, target-matched people through a human-managed service.
- Order status needs accessible states for ordered, recruiting, submitted, accepted, replacement needed, fulfilled, canceled, and refunded.

## Confirm, delete, and report

Account deletion, recording deletion, clip revocation, report submission, and admin moderation require explicitly named confirmation surfaces. Dialogs trap focus, support Escape when safe, keep Cancel available, and restore focus. Destructive and non-destructive choices do not rely on color alone.

Development fixtures and design-system validation must never contact production Supabase, private media, payment providers, or model APIs.

## Future reusable components

Before implementation, evaluate and contract the smallest reusable primitives needed for:

- transcript viewing and timed-word selection;
- annotation range controls;
- clip range editing and public clip presentation;
- star rating input and display;
- priority groups with source evidence; and
- AI context selection.

Each new reusable component requires typed React code, a catalog entry, a machine-readable contract, examples or stories, accessibility behavior, tests, and responsive validation at 390 × 844 and 1440 × 900.
