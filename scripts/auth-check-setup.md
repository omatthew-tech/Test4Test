# Daily authentication check

The `Daily authentication check` GitHub Actions workflow opens
`https://test4test.io/` in a fresh Chromium context, follows its
login link, enters the dedicated test account and passcode, verifies that the
authentication server validates the resulting user, opens Profile, and reloads
it to confirm the session persists.

Form fields are selected by their accessible textbox names, so decorative
required-field markers do not break the check. The retired
`/test4test-redesign` path is not the production homepage.

The check supports the redesign's **Profile menu → Profile** navigation and its
**Sign out** menu item, as well as the older layout's Profile link and Sign out
button. It verifies the account email in either the developer profile text or
the tester profile's email field. It only checks that Sign out is present; it
does not activate it.

This checks the existing **test-account login path**. It does not test delivery
or verification of regular email OTPs. Monitoring that path also requires a
dedicated, readable test mailbox. Do not substitute a personal or support inbox.

## Activation

1. Add the repository Actions secret `TEST_ACCOUNT_OTP_CODE`, matching the
   existing Supabase Edge Function secret of the same name. Do not put the value
   in source control, this document, or an automation prompt.
2. Ensure `test-account-login` is deployed and enabled, and the live frontend's
   `VITE_TEST_ACCOUNT_EMAIL` is `test@test4test.io`. This is already a confirmed
   Supabase auth account with a password as of October 6, 2026; it does not need
   an inbox for this passcode flow. Do not reseed or reset it just for monitoring.
3. Put the workflow and runner on the repository's default branch (`master`)
   and enable GitHub Actions. Scheduled workflows only run from that branch.
4. Run **Actions → Daily authentication check → Run workflow** once and confirm
   the result. The cron then runs daily at 4:00 a.m. Eastern using the
   `America/New_York` timezone, including daylight-saving changes. GitHub may delay runs;
   public-repository schedules can be disabled after 60 days without activity.

## Logs

Every completed check writes `artifacts/auth-check/latest.json`, appends to
`history.jsonl`, and writes `summary.md`. Each record includes a timestamp,
target, coverage, duration, last stage, status, and reason:

- `WORKING` (exit 0): the complete browser check passed.
- `NOT_WORKING` (exit 1): the tested login flow failed, with the failing stage.
- `BLOCKED` (exit 2): runner configuration, credentials, or proxy access prevented
  verification. This does not establish that the website's login is broken.

GitHub keeps each run's summary and uploads its logs as a uniquely named artifact
for 90 days, including failed checks. Each hosted run has its own history file;
the Actions run list and artifacts provide the daily history. A failed runner
installation is logged as `BLOCKED` too. No credentials, tokens, browser storage,
screenshots, traces, or raw server errors are included in logs.

## Local execution

Use Node 24, run `npm ci --legacy-peer-deps`, then
`npx playwright install --with-deps chromium`. Inject `TEST_ACCOUNT_OTP_CODE`
securely into the shell environment and run `npm run test:auth`.

Optional variables: `AUTH_CHECK_URL`, `AUTH_CHECK_EMAIL`, `AUTH_CHECK_LOG_DIR`,
`AUTH_CHECK_TIMEOUT_MS` (1000–120000), and `AUTH_CHECK_CHROMIUM_PATH` for an
installed browser. The runner preserves `HTTPS_PROXY`, `HTTP_PROXY`, and
`NO_PROXY` when configured. Network access must allow the website, its assets,
and its authentication API. Never bypass an environment's network policy.

`npm run test:auth:runner` exercises success, rejected login, invalid session,
wrong user, lost session after reload, site outage, missing secrets, and log
writing against a local fixture. It does not establish production login health.

The monitor closes its fresh browser without using global sign-out, which would
invalidate other sessions on the shared test account. It does not seed data,
modify account settings, or submit tests.
