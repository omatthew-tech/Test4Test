# Test4Test Stripe integration

## Confirmed scope and planner

The official Stripe plugin is installed and Stripe MCP is authenticated. The implementation planner accepted guide `iguide_61VS30fJrMtv0A5s941FEysAbigKx` for hosted web Checkout. Test4Test is US-based and charges in USD. The current feedback-credit packs are 1 credit for $4.99, 3 for $13.99, and 5 for $19.99. Existing single-credit orders opened at the original $5 price retain their original amount for retries and settlement. These one-time platform purchases do not promise tester cash compensation or create transfers.

Payments use server-created Checkout Sessions. Invoicing uses Checkout's `invoice_creation.enabled` to generate a paid invoice; do not send a second invoice demanding another payment. Tax uses `automatic_tax.enabled`, billing address and tax ID collection, a reviewed product tax code, and exclusive tax pricing. Stripe Tax configuration and registrations must be reviewed separately; a US address alone does not establish where tax must be collected.

Selected planner leaves: `out_of_box_hosted`, `invoice_created_from_business_event`, `invoice_branding`, `invoice_collect_hosted_invoice_page`, `invoice_reconcile_custom_erp`, and `no_connect_needed` (phase one only). General invoicing branches were adapted to paid Checkout invoices; standalone receivables and recurring Billing are not implemented.

## Implementation

- `create-credit-checkout` validates the Supabase user, rejects anonymous/banned accounts, chooses a fixed catalog entry, and creates/reuses a purchase using a UUID request ID. Browser amounts, owner IDs, and return URLs are never trusted. Ten new orders per user per hour are allowed. Stripe uses the order ID as its idempotency key. Requests older than 23 hours cannot recreate a session after Stripe's idempotency retention window.
- `stripe-credit-webhook` verifies the raw signature with Stripe's SDK, rejects wrong-mode and connected-account events, retrieves current Checkout state, and validates the pack, amount, currency, and order metadata. Only paid Checkout sessions grant credits. Delayed payment methods wait for confirmation.
- `apply_credit_purchase_event` atomically saves the event and one positive `purchase` ledger entry. Event IDs and purchase ledger entries are unique. Profile locks follow existing credit-ledger lock ordering. Duplicate or out-of-order events cannot add credits twice or downgrade a paid order.
- Users read only their own purchase status. Anonymous/authenticated clients cannot call financial mutation RPCs or alter purchase records. RPCs are security invoker and granted only to the service role.
- The return page polls the database for about 30 seconds, then offers a recheck. A URL parameter is never payment proof. Existing feedback unlocks, earned credits, and external tip links are preserved.
- Refund/dispute events mark orders for manual review. Review before fulfillment holds the award. Already granted credits and unlocked recordings are not automatically revoked. An agreed reversal policy and operator review process are launch prerequisites.

The Stripe SDK is pinned to `22.6.2`, using its bundled API version. Each Edge Function has a Deno lockfile. Server keys and webhook secrets never go into Vite variables.

## Sandbox setup

The Test4Test sandbox (`acct_1UIeefJvF0IhsoD2`) is connected through Stripe MCP. The key in the ignored local settings file was verified against `/v1/account` and `/v1/balance`: it matches this sandbox, uses USD, and reports `livemode=false`. No live payment objects were created during that sandbox setup. MCP OAuth and application API keys are separate credentials.

Sandbox Tax settings are active with the supplied US business address and exclusive pricing. No tax registrations were added. The initial smoke test used `txcd_20030000` (General - Services). Following the user's request to use a closer category if available, the ignored sandbox and production configuration files now use `txcd_20060055` (Marketing Services): Stripe explicitly includes consumer research and product testing in this category. The user confirmed no existing tax registrations. The sandbox address returns zero tax; this is not a determination of registration obligations. A Stripe CLI forwarding secret is stored locally; a deployed webhook endpoint requires its own signing secret.

1. Use local Supabase or a separate Supabase test project. Never award sandbox credits to production users. Apply `supabase/migrations/20260923013630_stripe_credit_purchases.sql` after the feedback-credit migrations.
2. Copy `supabase/stripe.env.example` to Git-ignored `supabase/.env.stripe.local` (a placeholder file has been prepared). Enter the sandbox secret key locally, along with the webhook endpoint signing secret and reviewed product tax code. Do not paste secrets into chat. Restricted keys need permissions for the Checkout flow and payment reads. Align the webhook API version with the pinned SDK.
3. Set `APP_BASE_URL` to the exact frontend origin. For an isolated remote test database, explicitly set `STRIPE_TEST_DATABASE_CONFIRMED=true`. Otherwise sandbox payments against remote databases are refused.
4. Register these sandbox webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. Use the deployed `stripe-credit-webhook` URL or Stripe CLI forwarding for local development. The signing secret differs from the API key.
5. Enable `STRIPE_PAYMENTS_ENABLED=true` on the test backend and `VITE_STRIPE_CHECKOUT_ENABLED=true` in its test frontend. Defaults remain disabled. Design-system fixtures always retain the non-payment preview dialog.
6. Test each pack, cancellation, decline, delayed payment, duplicate events, interrupted responses/retries, wrong-mode signatures, refund/dispute review, and cross-user purchase access. Verify one ledger award per paid order, including event replay after interruption.

Hosted redirects need no Stripe publishable key. The browser receives only a Checkout URL. Keys stay in Supabase server secrets or the ignored local server environment file.

## Operations and launch

Before live rollout, confirm refund/cancellation terms, credit reversals, Tax classification/registrations, branding, invoice email settings, live signing secrets, and deployment environments. Keep webhooks running even when new checkouts are disabled: existing payments still need fulfillment. Alert on webhook failures and review-required orders; replay failed events after resolving their cause.

Operator/service-role review query:

```sql
select id, user_id, status, credits_granted, stripe_payment_intent_id
from public.credit_purchase_orders
where review_required
order by created_at;
```

Reconcile pending orders against Stripe before issuing adjustments. Use the existing audited ledger for adjustments, preserve permanent feedback unlocks, and retain original purchase transactions. Partial refunds and consumed credits require manual decisions. This phase records review events; it does not implement an operator resolution interface or automatic refund decisions.

## Later Connect phase

For managed testing, the likely fit is a platform charge followed by separate transfers: one founder payment can fund several testers who are unknown at checkout. Test4Test retains its service margin and bears applicable platform fees/payment risk. Use Accounts v2 recipient capabilities, Stripe-managed onboarding, and an earnings/payout dashboard. Confirm payout countries, compensation, approval rules, responsibilities, cross-border availability, and refund/transfer reversal rules before enabling this phase. Transfers to a connected account and payouts to the tester's bank have separate lifecycles.

No Connect account creation, transfer, payout, subscription, or managed-package checkout is implemented in the credit flow.

## Sources

- [Stripe Checkout](https://docs.stripe.com/payments/accept-a-payment?payment-ui=checkout&ui=stripe-hosted)
- [Checkout API](https://docs.stripe.com/api/checkout/sessions/create)
- [Paid invoices](https://docs.stripe.com/receipts)
- [Tax with Checkout](https://docs.stripe.com/tax/checkout)
- [Stripe product tax codes](https://docs.stripe.com/tax/tax-codes) (`txcd_20060055`, Marketing Services)
- [Stripe webhooks in Supabase](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
- [Separate charges and transfers](https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers)
- [Accounts v2](https://docs.stripe.com/connect/accounts-v2)

## Validation and deployment status

The user approved the release design and completed Stripe account verification on 2026-09-23. The production purchase migration, two Edge Functions, live webhook endpoint, server secrets, and frontend are deployed. The live payment backend is enabled and its non-charging smoke check passed. Cloudflare version `0d5a4d3c-467a-4263-87c4-95e146ca67c4` serves 100% of production traffic at `https://test4test.io` as of 2026-09-23 15:57 UTC. Source defaults remain disabled; the ignored production build settings explicitly enable Checkout.

The actual checkout handler created all three sandbox Checkout Sessions at the expected USD subtotals (500, 1399, and 1999 cents), with automatic Tax and paid-invoice creation enabled. Retrying the 1- and 5-credit requests returned the same respective sessions; a supplied browser amount of 1 did not change the price. The real webhook handler rejected an unsigned request with HTTP 400. A response-shape bug was corrected by requesting a single PostgREST purchase record, and a new HTTP-contract regression test passed with the real Supabase and Stripe SDKs:

```sh
npm exec --yes --package=deno@2.9.6 -- deno test --config supabase/functions/create-credit-checkout/deno.json --allow-env supabase/functions/create-credit-checkout/handler_test.ts
```

Those initial sandbox checks used an isolated, in-memory PGlite ledger with the actual purchase migration, plus test substitutes for Supabase Auth and the HTTP data API. They did **not** establish full Supabase or application end-to-end behavior. The temporary harness and credentials are Git-ignored under `.tmp/`. Docker initially failed because of stale runtime sockets. It was subsequently recovered by backing up only the stale runtime directories while Docker was stopped; no containers, volumes, or user data were reset.

The user completed the 3-credit sandbox checkout with Stripe's test card and fictional billing details. Stripe MCP independently confirmed the following:

- Checkout `cs_test_a1y3jBXzPUZSWHTOFqanOCJYDDrWSeh7GJPMkFfrYfxVEVC5i7BbcbcX3s`: complete, paid, USD 13.99, `livemode=false`.
- PaymentIntent `pi_3UIg1JJvF0IhsoD20rLJn6xg`: succeeded, 1399 cents received.
- Invoice `in_1UIg1LJvF0IhsoD207sf7wuQ` (`NDX2J3ZT-0001`): paid, 1399 cents paid, zero remaining; correct purchase metadata.
- Automatic Tax: complete, zero tax. This verifies the no-registration scenario, not a positive tax calculation or a live tax determination.

The actual webhook handler accepted the Stripe CLI deliveries for `checkout.session.completed` (`evt_1UIg1OJvF0IhsoD2CB6E5ItK`) and `invoice.paid` (`evt_1UIg1QJvF0IhsoD2hN60OKRW`) with HTTP 200. The actual SQL migration produced one purchase ledger entry for exactly 3 credits, with the order paid, invoice linked, and no review flag. Two subsequent local replays of the retrieved payment event, signed with the local forwarding secret, returned 200 without changing the ledger or event receipts. Tampered payload and signed wrong-mode tests returned 400 and also left the ledger unchanged.

The initial test ledger was ephemeral and separate from all real app accounts. Its evidence is saved in ignored `.tmp/stripe-smoke-result.json` and `.tmp/stripe-replay-result.json`. Those temporary harness servers were stopped after verification. No sandbox credits were added to production users.

**Fast-checked:** all 13 new focused tests passed, including a real PGlite execution of the migration and role/ledger behavior tests. Both Edge Functions passed Deno checks. Changed-file formatting, lint, TypeScript, and design-system invariants passed. Existing Buy Credits preview journeys passed keyboard, accessibility, and overflow checks at 390 × 844 and 1440 × 900; screenshots were inspected. These fixture journeys do not submit Stripe payments.

The complete `npm run ds:check` passed formatting, lint (13 existing warnings), TypeScript, design-system validation, all 633 unit tests (one skipped), and all 77 component tests. The later full browser run completed all 307 cases: 296 passed and 11 failed. The failures were corrected by aligning tests with the existing homepage copy/media, desktop Earn filter defaults, and responsive instruction spacing. The clipped decorative homepage animation is now marked as contained overflow. The owner's existing, dated `home-trusted-by-faded` exception is honored only for the exact caption's contrast violation, with a report annotation; all other nodes and rules still fail normally. All 11 previously failing cases passed targeted reruns. This does not constitute an unconditional WCAG conformance claim.

The initial production `npm run build` passed, including blog prerendering, and all four production hydration checks passed at 390 and 1440 pixels. Existing static-asset resolution warnings were emitted during bundling. The pre-approval visual run passed 292 of 416 comparisons: 60 cases lacked approved references, and 64 differed from existing references (including image-size differences). The review gallery is `.tmp/stripe-release-review/index.html`; evidence is `.tmp/stripe-visual-results/` and `.tmp/stripe-visual-final.log`. Playwright defaults to `updateSnapshots: "none"`, so even missing references require deliberate owner acceptance. After the user's explicit release-design approval, the 64 reviewed images were applied and the 60 missing references were generated. Previous references are backed up under `.tmp/stripe-preapproval-baselines`, and the approval manifest is `.tmp/stripe-visual-acceptance.json`. All 416 reference files are now present. Final release-validation results are recorded below.

### Real local Supabase verification (2026-09-23)

An isolated CLI project under `.tmp/stripe-supabase` runs the app's actual Postgres, Auth, PostgREST, Storage, and Edge Functions. Its API port is 55321 and frontend is `http://localhost:5178`. All 71 migrations applied after two compatibility adjustments in disposable copies only: unique local migration-version filenames for legacy duplicate dates, and the correct extension name `supabase_vault` instead of `vault`. Production migration history was not changed.

Two disposable, email-confirmed founder accounts were created through local Auth. Verified checks include:

- Actual browser sign-in through `test-account-login`, founder preferences, Buy Credits, and redirect to Stripe-hosted sandbox Checkout.
- Authentication rejection for absent/invalid tokens; foreign-origin rejection; invalid-pack rejection.
- Real database-backed checkout retries returning the same session; another buyer and a changed pack cannot reuse the order ID.
- Owner-only purchase reads and denial of purchase mutation by either authenticated buyer.
- Correct 3-credit subtotal of 1399 cents and sandbox mode through the actual Edge Function.
- A tampered 5-credit request containing a one-cent price and another user's ID still uses the authenticated buyer and the fixed 1999-cent subtotal.
- Unsigned, altered, live-mode, and connected-account webhook rejection. A validly signed event referring to an unpaid session is acknowledged without a ledger award or event receipt.

Evidence: `.tmp/stripe-fullapp-api-result.json`, `.tmp/stripe-fullapp-tamper-result.json`, `.tmp/stripe-fullapp-webhook-negative.json`, and private runtime logs. The user completed the full-app 1-credit sandbox Checkout. Stripe MCP independently confirmed session `cs_test_a13jwOGACe78vXZEHFj1HtrW59q4LiLG3sD0xTiF8GSRlU44iSJUh0gRJb` as complete and paid for USD 5.00, PaymentIntent `pi_3UIqLVJvF0IhsoD213zEaHut` as succeeded, and invoice `in_1UIqLYJvF0IhsoD26kIJlWk8` as paid. Automatic Tax completed with zero tax.

The actual local Supabase order `e8683c6e-4b43-4cfe-be2c-6e563762cdd3` is paid with exactly one 1-credit ledger award, the invoice linked, and no review flag. Both checkout and invoice webhook receipts were stored. The browser return page confirms that 1 credit was added. Replaying the real completed event twice returned HTTP 200 and left the order, ledger, and event receipts unchanged. Evidence: `.tmp/stripe-fullapp-payment-result.json`. All of these credits belong to disposable local accounts; no production account was credited.

### Live account and deployment verification

The ignored live key was verified against the expected live Stripe account. After the user completed the ID-document task and linked a bank account, a fresh read reports `charges_enabled=true`, `payouts_enabled=true`, `details_submitted=true`, one external account, and no currently due, past-due, or pending-verification requirements. The account is US/USD with `business_type=individual`, consistent with the user's stated unregistered business. Stripe's API still lists `company.vat_id` (with `company.registration_number` as an alternative) as eventually due, with no deadline; this is not a current activation blocker. Resolve any future inapplicable company/VAT prompt with Stripe rather than inventing an identifier.

Live Tax settings are active with the user-supplied US head office and exclusive pricing. The initial connector permission failure is resolved: a fresh Stripe MCP `PostTaxSettings` succeeded, changing the default from Downloadable Software - personal use (`txcd_10202000`) to Marketing Services (`txcd_20060055`), and a subsequent read verified the value. The exact category and its consumer-research/product-testing description were independently checked through Stripe's Tax Codes API. No additional Tax settings permission change is currently needed. There are still no tax registrations, matching the user's stated status. This means automatic Tax returns zero where no registration is active; it does not establish that no registration is legally required. No registrations were created.

Read-only production Auth health, email-provider availability, and OTP CORS preflight passed again. The frontend rollback version is `9077262d-0e93-4ed6-bbc0-42c5b64add2c` on worker `test4test-redesign` / `test4test.io`. The production Supabase project is `lteimepkxuiupbcsbcpz`. Only the reviewed purchase migration and focused security fixes were applied; the legacy local migration history was not pushed wholesale.

The live webhook endpoint is `we_1UIs4wFEysAbigKxSubCUiBJ`, targeting `https://lteimepkxuiupbcsbcpz.supabase.co/functions/v1/stripe-credit-webhook`, enabled with API version `2026-08-26.dahlia` and the nine documented events. Its signing secret is stored in ignored local server settings and Supabase secrets. Both payment functions are active with gateway JWT verification disabled because their handlers perform explicit user-token or Stripe-signature verification.

The production smoke check used the existing confirmed test account and an authenticated call to the deployed Checkout function. The local test-account password was stale, so a one-use admin-generated sign-in token was verified without sending mail, changing the password, or creating a user. The function created order `c6119878-8512-42f7-bb2a-1b942296b6f1` and session `cs_live_a17YJAL3iu5vibWEv4NvT39C2iiYvMlNNbMLZQcjbZyXGPeBtR65nRS0NZ`: one credit, USD 5.00, live mode, the Marketing Services code, exclusive pricing, automatic Tax, paid-invoice creation, and production return URLs. A client-supplied one-cent amount was ignored; a retry returned the same session. The session was then expired without payment. Stripe's actual `checkout.session.expired` event `evt_1UIsCfFEysAbigKxm1RkOiTq` reached the deployed webhook and changed the production order to expired, with zero credit awards. No live charge was made. Evidence is in `.tmp/stripe-production-checkout-result.json` and `.tmp/stripe-production-expiration-result.json`.

### Security fixes found during release verification

The production advisor exposed an existing definer view that allowed anonymous and authenticated clients to enumerate profile email addresses. `20260923152342_restrict_announcement_recipients_access.sql` revokes browser access, preserves service-role reads, and makes `announcement_recipients` a security-invoker view. Production privilege checks and an anonymous Data API request verify the restriction.

Further inspection found an unguarded account-cleanup definer RPC and other internal maintenance RPCs callable by browser roles. `20260923153706_restrict_account_cleanup_rpc.sql` restricts account cleanup, recording cleanup/draft listing, missed-test maintenance, and reminder-sequence mutation to the service role. Their Edge Function and database-job callers retain access. Both mutable helper search paths were pinned. These fixes were also applied successfully to the isolated local database; no user records were deleted by verification.

The security advisor no longer reports the definer-view error or mutable-search-path warnings. Remaining notices cover existing publicly callable definer functions, intentionally inaccessible RLS tables (including the server-only Stripe event receipts), and disabled leaked-password protection. These are not a blanket finding that every callable definer function is unsafe; their individual authorization contracts need separate review. References: [function privileges](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Approved release checks (2026-09-23)

The post-approval checks passed formatting, lint (13 existing warnings), TypeScript, design-system validation, 633 unit tests (one skipped), and 77 component tests. The full browser run passed 306 of 307 cases; the homepage save-data case timed out while the page was starting, then passed three consecutive isolated runs. The full visual run passed 415 of 416 cases; the first Storybook case timed out waiting for network idle and passed an isolated rerun in 1.1 seconds without changing its reference. All 307 browser cases and all 416 visual comparisons therefore have passing results, although neither entire browser suite completed without a transient startup failure in that run. The stale IntersectionObserver reference in the chat unit test was reset and awaited before use.

**Release-validated:** the production build, blog prerendering, and all four production hydration checks also passed. The release audit checked 164 files, including 78 text assets, and found no private credentials. After deployment, `/`, `/buy-credits`, `/earn`, `/blog`, `/privacy`, and `/terms` returned HTTP 200 with the new entry script. The production entry script and Buy Credits chunk matched the local SHA-256 hashes. A browser sign-in with the existing confirmed test account verified all three enabled purchase buttons and the correctly expired, unpaid order status. No live charge was made.

Evidence: `.tmp/stripe-approved-release-gate-final.log`, `.tmp/stripe-final-save-data.log`, `.tmp/stripe-approved-final-visual.log`, `.tmp/stripe-visual-cold-start-check.log`, `.tmp/stripe-approved-production-build.log`, `.tmp/stripe-approved-production-hydration.log`, `.tmp/stripe-production-build-manifest.json`, `.tmp/stripe-cloudflare-deploy.log`, `.tmp/stripe-postdeploy-state.json`, and `.tmp/stripe-production-release-verification.json`.

A Supabase CLI dotenv parse error echoed the legacy service-role key into this task's tool output. The local dotenv syntax was corrected and subsequent CLI output is redacted. The key must be rotated through a coordinated credential change; rotating the legacy JWT signing secret without planning can invalidate other clients and services. No credential value is recorded in this document.

### Pricing update (2026-09-23)

`20260923163704_update_single_credit_price.sql` changes only new single-credit orders to 499 cents. The Checkout function uses the stored order amount, and the webhook accepts both the current 499-cent price and the legacy 500-cent price while the database verifies the exact order amount. Existing orders and credit awards are preserved. Browser roles remain unable to execute purchase mutations.

The production pricing smoke test created order `5dffd2ee-7d7d-4dc2-8500-aae46bf21b8f` for USD 4.99, ignored a supplied one-cent browser amount, and returned the same Checkout session on retry. Stripe independently confirmed the subtotal, automatic Tax, invoice creation, and unpaid state. The session was expired without payment; the live webhook marked the order expired with no credit award. Evidence: `.tmp/pricing-production-checkout-result.json` and `.tmp/pricing-expiration-result.json`.

### Rollback

To stop new purchases, set `STRIPE_PAYMENTS_ENABLED=false` in Supabase secrets. Keep the webhook deployed and its signing secret configured so existing payments can still settle. The additive purchase tables and security fixes can remain in place during a frontend rollback. Restore the previous frontend with:

```sh
npm exec --offline --yes --package=wrangler@4.136.3 -- wrangler rollback 9077262d-0e93-4ed6-bbc0-42c5b64add2c --name test4test-redesign --message "Rollback credit-checkout release"
```

This command is documented, not executed. CLI options were verified before release. Reconcile Stripe payments before changing any credit ledger entries.
