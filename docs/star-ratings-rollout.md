# Exact star ratings

The application uses `StarRating = 1 | 2 | 3 | 4 | 5`. A missing rating record is unrated. New writes contain `star_rating` only; retained `rating_value` fields are audit/rollout compatibility data, never the source of reputation or eligibility.

- Existing missing stars map from frowny → 1, neutral → 3, smiley → 5. Explicit stars are never overwritten.
- Satisfaction is the rounded average of qualifying stars multiplied by 20. Unrated records are excluded. Existing approved/credited filters, 100% no-rating defaults, and the visibility summary's null value before a completed test remain intact.
- Ratings of 1–4 allow reports. Revisions additionally require a live test and no pending report. Pending reports block duplicate reports and revisions. Five-star and unrated feedback cannot be revised/reported.
- Submitted cards always show the exact stars or “Not rated,” separately from their status. One-to-four-star cards sort by score then newest first, and retain the existing no-favorite convention.
- Revisions archive the previous rating in `test_response_versions.rating_snapshot` and remove the current rating, so the revised recording starts unrated. Credits remain independent of ratings.
- Paid access uses the unchanged distinct, approved, credited **credit-test** counts and two five-star ratings. Converted five-star ratings count immediately. The backfill suppresses only `sync_paid_test_notifications_after_rating`; subsequent activity uses the original trigger.

## Local deployment artifacts

1. `supabase/migrations/20260918021245_exact_star_ratings.sql`: transactional backfill, constraints, all four reputation RPCs, revision/report guards, and the service-role-only report claim RPC. It retains compatibility output columns and all ownership/RLS policies. The backfill is safe to rerun.
2. `supabase/functions/report-feedback-rating/`: validates exact stars, reserves a pending report through `claim_feedback_rating_report`, then sends the existing notification with an exact star label. The claim serializes against revisions and rating updates, checks ownership and the expected rating, and makes concurrent duplicate requests no-ops. An SMTP failure leaves the persisted pending report available for review; retrying the request returns the existing pending report without sending a duplicate notification.
3. Frontend and design-system changes: deploy only after the database migration and reporting function are in place. `get_my_submitted_feedback_cards` now appends `star_rating`; the legacy fields remain for older readers.

No production migration or function deployment is part of this change. Before a separately authorized rollout, review the complete pending migration list, including earlier local work. Apply the database changes first, deploy the reporting function second, and release the frontend last. Do not roll back to a face-only writer after the required-star constraint is active.

## Validation commands

```powershell
npx vitest run --project unit tests/unit/star-ratings-database.test.ts tests/unit/star-ratings.test.tsx tests/unit/recording-versions.test.ts tests/unit/recording-feedback.test.tsx tests/unit/recording-feedback-data.test.ts
npm exec --yes --package=deno@2.9.6 -- deno test --config supabase/functions/report-feedback-rating/deno.json --allow-env --allow-read supabase/functions/report-feedback-rating/
node scripts/run-playwright.mjs a11y tests/playwright/star-ratings.journeys.spec.ts tests/playwright/recording-feedback.journeys.spec.ts
npm run ds:check
```

The SQL suite runs the complete new migration in local PGlite and exercises migration reruns, legacy conversion, explicit-value preservation, invalid values, all satisfaction scores, mixed/default values, homepage/visibility ordering, paid eligibility, notification suppression, and report ownership/eligibility. Recording version tests exercise all revisable star values and retained history. Edge tests use a fake client and fake sender; they never send real email. Browser journeys use isolated fixtures at 1440 × 900 and 390 × 844.

The read-only `StarRatingDisplay` is exported from `@test4test/design-system` with its catalog entry, generated contract, story, screen-reader label, and tests. Its new visual baseline must be accepted separately; validation does not update reference screenshots.

## Validation results

Status: **Fast-checked**. The full release gate was run; this change is not marked Release-validated.

- Formatting, lint (existing warnings only), TypeScript, and design-system invariants passed.
- All **291 unit tests**, **74 Storybook tests**, and **12 reporting Edge Function tests** passed. The final database ownership guard was rechecked with all 24 migration/database tests passing.
- The full browser suite finished with **223 passed and 12 existing failures**. The star-card and recording-rating journeys pass at desktop and mobile sizes, including accessibility. Screenshots were inspected; a separate mobile touch check confirmed 44 × 44 star targets and explicit Submit.
- Frontend production build and Storybook build passed independently.
- New star-display visual comparisons at mobile, tablet, laptop, and desktop report missing initial baselines. They ran with `--update-snapshots=none`; no reference screenshots were created or changed in this rollout.

The 12 unrelated browser failures match the previously observed failures: homepage Trusted by contrast (one), obsolete homepage showcase/recruitment expectations (three), outdated Analytics and recording-navigation expectations (three), Earn preference/paid-availability fixtures (three), and microphone layout checks (two). The release gate stops at these browser failures before its full visual/build stages. Details are in `output/validation/star-ratings-release.log`; production and Storybook build logs and inspected screenshots are also in `output/validation/`.
