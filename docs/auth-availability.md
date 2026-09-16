# Authentication availability and September 16, 2026 incident

## Confirmed failure chain

The production sign-in page called Supabase `POST /auth/v1/otp` with the correct
project URL and an enabled public key. The project backend was unresponsive:

- Production logs contain OTP HTTP 504 failures at 08:21, 08:38, and 08:39 EDT,
  followed by a reproduced HTTP 522 at 08:42 EDT. Public database RPCs also failed.
- Auth health returned HTTP 504 with both the publishable and legacy anon key.
  The settings endpoint returned HTTP 522. These error responses lacked
  `Access-Control-Allow-Origin`; the browser therefore exposed only `Failed to fetch`.
- OPTIONS preflight succeeded. An invalid key returned HTTP 401 immediately.
  Those checks prove the gateway was reachable, not that the Auth service was working.
- The dashboard reported **Database not usable**, with `CONNECT_TIMEOUT` after
  5002 ms. SQL probes timed out; scheduled jobs logged startup timeouts.
- The management API's `ACTIVE_HEALTHY` project status was misleading during
  the incident. Database resource metrics were unavailable during the failure.

With the owner's approval, the production project was restarted. Postgres started
at 12:57:42 UTC. At 12:59 UTC, Auth health, email settings, and browser preflight
all passed in less than one second. The production sign-in handler again returned
the expected account validation response for a deliberately nonexistent address.
No user was created and no code was sent by that probe.

A post-restart database probe succeeded: 34 MB database, 143 auth users, 14 of 60
connections, and zero waiting locks. These figures do **not** prove the resource
conditions before the outage. The exact host-level trigger is still unconfirmed;
do not describe a restart or a frontend change as a permanent cure for provider
availability. Once metrics became available again, the 24-hour charts showed
sustained swap use, memory commitment near the displayed commit limit, and a
large I/O-wait component near the outage. This warrants a provider/resource
investigation, but does not by itself establish an OOM crash or prove a specific
query was responsible. No API keys, CORS policy, RLS, SMTP settings, database
schema, or paid compute configuration were changed.

## Application safeguards

- Auth fetches have a 15-second deadline, including response-body reads.
- An expired deadline aborts the request and releases the form's pending state.
- Network/gateway errors receive actionable service-unavailable feedback;
  offline browsers receive connection guidance. API rate limits and invalid-code
  messages remain intact.
- OTP sends and verifications are not automatically replayed. A timed-out send
  may have reached the server, so blind retries could send duplicate emails or
  invalidate codes. Only a successful send creates a local OTP challenge.
- Database requests, Edge Functions, and recording uploads retain their existing
  transport behavior. Session persistence and refresh remain with the Supabase SDK.

## Read-only health check

Run `npm run auth:check` with the production build's `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key). The command also reads Vite's
production environment files. `AUTH_CHECK_ORIGIN` defaults to `https://test4test.io`.

The check validates real Auth health, email-provider settings, OTP preflight,
and CORS response headers. It never sends an email, creates a user, or prints a
key. A failed probe exits nonzero. Only browser-safe keys are accepted.

Use this alongside deployment checks and incident triage. Passing checks do not
prove SMTP delivery or successful OTP verification: complete one real sign-in
with an authorized test account after recovery or release.

## Recurrence procedure

1. Run the health check and record UTC timestamps and response statuses. A
   successful homepage or OPTIONS response is insufficient.
2. Inspect Supabase service health, API/Auth/Postgres logs, and database resource
   metrics. Preserve evidence before restarting. Do not change credentials or
   access policy in response to a transport timeout.
3. If the database is unreachable, get owner approval for a project restart.
   Afterward, repeat the probes and complete a real OTP sign-in.
4. If this recurs, provide Supabase support with the project reference,
   timestamps, gateway statuses, missing metrics, and TCP connection timeouts.
   Ask for the underlying host/container failure and corrective action. Evaluate
   query or compute changes only when resource evidence supports them.

References: [Supabase unhealthy-service guidance](https://supabase.com/docs/guides/troubleshooting/project-status-reports-unhealthy-services)
and [passwordless email authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Validation and rollout status

The application changes are **Fast-checked**. Twenty auth regression tests pass,
as do the production build and all eight targeted sign-in accessibility and
visual checks. The outage message was inspected at 390 × 844 and 1440 × 900.
No visual baselines were updated.

The full release command passed formatting, lint (with existing hook warnings),
type checking, design-system validation, 140 unit tests, and 71 component tests.
Its application suite passed 212 checks and failed nine checks concerning home
contrast/content, older Analytics navigation expectations, and recording links.
Those fixtures run without a configured backend and do not exercise the new
auth transport. Four additional health-check unit tests were added afterward
and pass in the targeted auth suite. This is not a full release-validated state.

The production recovery is complete and the dashboard reports Healthy. The
application safeguards remain local pending deployment approval. No full real
user OTP sign-in has yet been confirmed in this investigation.
