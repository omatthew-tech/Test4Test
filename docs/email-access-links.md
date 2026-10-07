# Reusable notification sign-in links

This change is prepared locally. Production deployment and real email sends require a separate authorized rollout. The last read-only production compatibility check timed out; local checks do not establish live health.

## Behavior

New feedback, test-back, and Google Play reminder emails can contain `/email-access#token=…` links. Each destination has an independent, random 256-bit credential. Links have no expiration or usage limit, work after logout, establish a normal persistent Supabase session, and automatically switch the signed-in account. Anyone holding a link can access its recipient's account until that link is revoked.

The bootstrap captures and scrubs the fragment before importing the application, analytics, account loader, or chat provider. It POSTs the credential to `redeem-email-link`, installs the verified session, then replaces the document with the canonical destination. Account drafts are namespaced and retained for their original owner; a full document navigation clears account-dependent component and module state. Other open tabs reload when they receive an account-switch event.

Feedback targets `/recordings?response=<responseId>`; test links target `/test/<submissionId>`. Existing `earn_entry` and `feedback_source=earn` attribution is retained. The exchange never unlocks feedback or awards credits. The destination's existing `open_received_feedback` transaction continues to enforce ownership, sufficient credits, and a single debit. Missing resources keep their destination's unavailable state.

Existing email links and ordinary public/shared URLs remain ordinary URLs. There is no bulk resend or penalty adjustment.

## Storage, restrictions, and recovery

The additive migration stores only a SHA-256 token hash, recipient, issued-to email, destination, creation time, and revocation state in `private.email_access_links`. Browser roles cannot access records or invoke issuance, resolution, rate, or lease RPCs. Service-role-only wrappers expose narrow operations; Profile exposes only the authenticated caller's revoke operation.

Every redemption checks the current Auth account, confirmed email binding, Auth ban, application ban, and revocation. The checks run again after session generation. Existing matching sessions are verified with Auth before reuse. New sessions use admin `generateLink` followed by immediate server-side `verifyOtp` on a separate request-local client; generated and verified user IDs must match the stored recipient. The durable emailed token is never a Supabase OTP and is never consumed.

Database leases serialize generation for a recipient. The lease lasts 30 seconds; individual Auth/database requests time out after five seconds. Successful Auth exchanges release the lease; ambiguous failures retain it until expiry because a timed-out upstream operation may still be running. Busy or temporarily failed exchanges offer retry. No request performs an automatic replay of the one-time Auth verification. Per-minute throttling allows 60 requests per gateway-supplied client IP and 30 per valid recipient; there is no lifetime click limit. Minute buckets are pruned during requests. Use the hosted gateway's sanitized `X-Forwarded-For` chain and add ingress rate limits if another proxy is introduced; browser-supplied headers must not become trusted IP identity.

Profile invalidates all the caller's currently issued links, without signing out existing sessions. Confirmed Auth email changes permanently revoke old links, even if the old email is later restored. Account deletion cascades to credentials and leases. There is no logout trigger. GET, HEAD, and OPTIONS never authenticate, unlock, submit, or award credits.

The migration also changes `responses_select_related` to `TO authenticated` while preserving its existing ownership/unlock predicate. Anonymous published instruction/question reads can then traverse response policies without attempting the private feedback permission function. Private feedback remains inaccessible to anonymous callers.

## Deployment order

1. Recheck live API/Auth/database health and inventory deployed function versions, current migrations, policies, and frontend revision. Preserve unrelated hosted changes. The local migration history contains other pending work; do **not** blindly push every local migration.
2. Apply only `20261006121131_reusable_email_access_links.sql`, after confirming the existing `responses_select_related` policy, `private` schema, `current_user_has_app_access`, profile ban values, and response/submission ownership columns match. Inspect advisors and verify privileges/RLS with anonymous, authenticated, and service roles. Do not grant browser access to private token tables.
3. Deploy `redeem-email-link` with `verify_jwt=false` (it validates its own credential). Configure exact comma-separated `EMAIL_ACCESS_ALLOWED_ORIGINS`, normally `https://test4test.io`. No wildcard or untrusted preview origins. Configure the normal server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`. Confirm POST responses have `no-store` and restrictive CORS; GET/HEAD must return 405 from an allowed origin (403 without one).
4. Deploy the frontend and `/email-access` no-store/no-referrer/noindex headers. Verify the fragment disappears before analytics, and no App/account/chat requests occur before authentication. Confirm the new Profile revoke action is available for founders and testers.
5. Inspect each hosted sender before deploying its updated source: `send-test-results-notification`, `send-test-back-reminders`, and `send-google-play-closed-test-reminders`, including their shared modules. Keep `EMAIL_ACCESS_LINKS_ENABLED=false` during this deployment. Delivery deduplication, reminder claims, and scheduling remain in the existing workers.
6. Create a dedicated SMTP2GO API key with **click tracking and open tracking disabled**. Also disable body archiving and audit/BCC copies for credential delivery. SMTP2GO's send API does not provide a documented per-message click-tracking switch. Store this key only as `SMTP2GO_AUTH_LINK_API_KEY`; set `SMTP2GO_AUTH_LINK_TRACKING_DISABLED=true` only after inspecting its provider configuration. Credential sends fail closed if either setting is missing; they never fall back to the ordinary SMTP key. Keep `APP_BASE_URL` an HTTPS origin with no path/query/fragment.
7. In an isolated test deployment, set `EMAIL_ACCESS_LINKS_ENABLED=true` and send controlled test-account notifications through all three workers. Check both HTML and plain text, including test-back emails containing two independent links. Check the delivered URLs are not provider-tracked or rewritten, secrets are absent from application/provider debug logs and analytics, and retries remain deduplicated. Test fresh, matching, and different-account browsers; repeated and concurrent clicks; logout/reuse; revocation; email change; restricted/deleted accounts; missing targets; and insufficient credits. Verify one debit on an eligible feedback open and no debit from the exchange or previews.
8. Only after those checks and production approval, enable production issuance. Disabling `EMAIL_ACCESS_LINKS_ENABLED` stops new issuance but intentionally does not invalidate links already delivered. Keep the frontend `/email-access` route, endpoint, and additive schema available for those links, or explicitly revoke them if an incident requires it.

Do not capture real credentials in screenshots, support tickets, error logs, traces, or analytics. The endpoint only returns generic errors; credential email transport suppresses provider response bodies and error details. Trace collectors must redact POST bodies and Authorization headers. The raw token remains in memory only during the exchange; retry retains it in memory, and refreshing the scrubbed URL requires reopening the original email.

## Local validation

- `npx vitest run --project unit tests/unit/email-access-endpoint.test.ts tests/unit/email-access-database.test.ts tests/unit/email-access-client.test.ts tests/unit/email-access-delivery.test.ts tests/unit/email-access-notifications.test.ts tests/unit/email-reminders.test.ts tests/unit/email-workers.test.ts tests/unit/feedback-unlocks-database.test.ts`
- `npm run test:email-access:browser` uses an intercepted reserved test domain and runs at 390 × 844 and 1440 × 900. It does not send email or contact production. Screenshots are local test artifacts, not accepted visual baselines.
- `npm run ds:check` is the Tier 3 gate. Existing approved visual baselines must remain unchanged until the design-system owner accepts the new Profile section.

### Results on 2026-10-06

Status: **Fast-checked; release validation remains incomplete.**

- Unit suite: 728 passed, one skipped, across 77 files. The endpoint/database suite also passed after the final session-lease hardening.
- Dedicated email-access browser suite: 16 passed at 390 × 844 and 1440 × 900, including actual client logout and link reuse, account switching, URL scrubbing, retry, invalid links, and founder/tester revocation controls.
- Route accessibility and journeys: 310 passed. Storybook component tests: 77 passed.
- Format, lint, TypeScript, design-system validation, fast UI checks, application build, Storybook build, and changed Edge Function Deno type checks passed. Lint retains 14 existing warnings.
- The full release command was attempted; its browser stage initially encountered a local port conflict. The remaining accessibility, visual, and build stages were then run separately. Visual comparison completed with 401 of 416 passing. Eight Profile snapshots differ because of the new revocation section; four Submissions snapshots have an existing spacing difference reproduced with the original application bootstrap; three Storybook cases time out while loading or waiting for network idle. All seven non-Profile failures reproduced in a focused rerun. No approved baseline was changed.
- Browser artifacts are retained under `.tmp/email-access-browser`; full visual-failure evidence is under `.tmp/email-access-release`. These are local artifacts, not committed baseline approvals.

Live Auth compatibility, hosted function versions, SMTP2GO settings, and controlled delivered emails remain rollout checks. Local mocks and database tests do not establish those production properties.

Provider references: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [SMTP2GO send API](https://developers.smtp2go.com/reference/send-standard-email), [SMTP2GO click tracking](https://support.smtp2go.com/hc/en-gb/articles/900002237106-Click-Tracking).
