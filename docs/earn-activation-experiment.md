# Earn first-test experiment

`earn_activation_v1` compares two complete experiences: A lists the selected eligible
app immediately and shows the first-credit welcome announcement; B hides it from
Earn until its owner completes a credited test and shows the original call to action.
Public share links continue to work in both versions.

## Enrollment and lifecycle

- The migration creates the experiment in `draft`, with enrollment disabled.
- A verified administrator starts it in **Admin → Earn first-test experiment**.
  The server records the launch timestamp. Only founder accounts created at or
  after that timestamp can enroll. Existing accounts are not backfilled.
- Publishing or selecting an eligible live app assigns its owner once, provided
  the owner has never completed a credited test. A deterministic hash of the
  experiment key and authentication UUID selects A or B with equal probability.
  Assignment is stored on the server and survives device and app changes.
- Pause stops enrollment and preserves assigned experiences and measurement.
  Resume preserves the original launch timestamp.
- End restores automatic listing, records a cutoff, and stores an immutable
  aggregate report. That experiment cannot restart. Use a new experiment key for
  another comparison.

## Measurement

Exposure is the first successful server write after the assigned Earn panel is
rendered in a visible page and intersects the viewport. A platform-selection
dialog postpones exposure until it closes. Retries and other devices cannot reset
the first timestamp. Failed exposure writes retry while the page remains open.

Completion is the first response that becomes both `approved` and `credit_awarded`.
A database trigger records the milestone in the same transaction as submission or
moderation. Adjustments, credit spending, later tests, and browser analytics do not
change it. If moderation grants credit later, the original submission visit is
retained. Legacy callers and missing visit data still count under Direct / unknown.

The primary denominator is participants exposed before their first credited
completion. Reports show assigned-but-unexposed users separately. Completion rate
is completions divided by exposed users; not-yet-completed is exposed minus
completions. Median elapsed time uses completers only, measured from first Earn
exposure to credit approval. Results are cumulative, with unequal observation time
and no fixed deadline or automatic winner. The difference is A minus B in
percentage points.

## Attribution and privacy

The browser retains a visit ID across reloads. It renews after 30 minutes without
activity, when switching authenticated accounts, or on a newly tagged email entry.
Routine navigation preserves its source. Sign-in preserves an email, shared-link,
or external-referral source; otherwise it records normal sign-in or signup.

New notification URLs use `earn_entry=feedback_email`, `test_back_email`, or
`other_email`. The app consumes that marker before authentication redirects.
Previously sent untagged links may remain unknown; delivery records are not clicks.
The server accepts only source categories and route categories, never full URLs,
referrers, authentication tokens, or individual journey exports.

Private tables have RLS and no participant table grants. Checked RPCs bind visits
and exposure to `auth.uid()`. The summary exposes only the caller's assignment.
Aggregate reporting and controls verify the authenticated, confirmed email against
the existing admin allowlist on the server.

## Deployment and verification

1. Apply `20260919173939_earn_activation_experiment.sql`; confirm `draft` and zero
   assignments. It preserves the legacy submission RPC and summary fields.
2. Deploy tagged notification links and the UI. Keep enrollment disabled.
3. Verify the summary, listing, admin authorization, and both responsive variants.
4. Start enrollment in Admin only after accepting the release. Starting defines
   the new-account cutoff; no account or submission backfill is needed.

Regression coverage includes real PostgreSQL execution through PGlite for
assignment, listing/ranking restrictions, exposure idempotency, credited milestones,
source ownership, moderation approval, admin access, pause, and frozen reports.
UI coverage includes both Earn variants and Admin at 390 × 844 and 1440 × 900,
keyboard focus, reduced motion, accessibility, errors, and empty states.

Visual baselines must not be regenerated without design-system owner acceptance.

## Rollout record — September 19, 2026

- Applied the migration to the configured Test4Test project
  (`lteimepkxuiupbcsbcpz`) as version `20260919173939`. Verified `draft`, no launch
  timestamp, and zero assigned participants. The local filename matches the hosted
  migration history.
- Deployed the frontend to `test4test.io`, Cloudflare version
  `3eba358e-b712-4280-93d8-b8f03f7a0a77`. Enrollment remains disabled. Previous
  frontend rollback target: `bf025eaa-a8bc-40c7-9ecd-c17302135eb7`.
- Tagged the existing deployed notification functions while preserving their other
  hosted behavior: feedback (v35), test-back reminders (v32), Google Play reminders
  (v15), report moderation (v18), and both tip-payment notifications (v21).
  The paid-test availability function is not deployed in this environment; its
  source is tagged for a future deployment. No test emails were sent.
- Verified real hosted RPC execution for the existing-account numeric summary,
  filtered listing, non-admin rejection, private-table denial, and authorized
  aggregate reporting. Security advisors added no new findings.
- Fast-checked the changed interface and build files. The 40 focused unit/database
  regressions and six responsive experiment browser checks passed. The normal
  production build and Storybook build passed.
- The full release gate is not green: the broad browser run had 234 passes and 13
  failures. One transient blog reflow failure passed on rerun; the remaining 12
  failures reproduced on untouched HEAD. They cover home contrast/content, older
  analytics selectors, existing Earn filter/paid fixtures, and microphone layout
  expectations. The visual comparison had 301 passes and 91 failures, including
  missing and changed baselines. No baselines were created or updated.
- A production smoke test caught the public `Assets` directory colliding with
  generated `assets` on Windows. The unchanged PayPal SVG now lives under `images`,
  and generated bundles use a fresh subdirectory to avoid cached failed requests.
  After correction, JavaScript responses and the Admin sign-in page rendered
  successfully. Subsequent normal builds preserve lowercase `assets`.

Do not start enrollment until the outstanding release checks and visual acceptance
are resolved. The migration and UI are deployed in advance so Start can establish
the actual new-account cohort at that point.
