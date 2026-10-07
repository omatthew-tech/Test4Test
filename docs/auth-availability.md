# Authentication availability and recurring incidents

## Background scheduling reduction — October 6 implementation

**Deployed and cut over at 11:23 EDT (15:23 UTC).** Cloudflare's first observed
scheduled recovery completed at 15:22:34 UTC with outcome `ok`, reported CPU
time 0 ms at the log's resolution, and a matching Supabase heartbeat. The three
minute dispatch jobs are inactive; the hourly test-back and daily Google Play
reminders remain active. Worker version: `667b6492-4009-4096-8489-3d0a378e668f`.
Edge versions: transcript dispatcher 7, clip dispatcher 5, recovery endpoint 1.
Cutover migration: `20261006152321_activate_external_background_scheduler.sql`.
Hourly maintenance was verified by an authenticated live invocation; its first
automatic hourly execution has not yet been observed. No billing upgrade or
customer test email was performed.

The no-cost mitigation uses durable database queues with immediate, post-commit
dispatch and an external Cloudflare Worker for recovery. It reduces avoidable
idle work; it does **not** establish that application polling caused the outage
or demonstrate that future disk-budget exhaustion is impossible.

Implementation:

- `20261006150842_reduce_idle_background_scheduling.sql` adds private dispatch
  coalescing, queue wakeup triggers, scoped transcript reuse, a service-only
  recovery/maintenance RPC, and aggregate scheduler health records.
- New transcripts and manual retries, and initial chat emails, request a wakeup
  after their durable transaction commits. Completion wakes remaining eligible
  work. Existing clip Save/retry dispatch is preserved. One-second coalescing
  avoids bursts; a missed/failed/coalesced handoff remains recoverable.
- Claims, attempt IDs, leases, processing concurrency and retry backoff remain
  authoritative. Future chat reminders do not cause immediate dispatch. Email
  delivery remains at least once, with the existing ambiguous-send limitation.
- `services/background-scheduler/` contains the separate Worker. Its recovery
  cron is `2-59/5 * * * *` UTC and maintenance is `19 * * * *` UTC. It calls
  `recover-background-jobs` using a dedicated secret shared only between Worker
  secrets and Supabase Edge secrets. No service-role key is sent to Cloudflare.
- Recovery checks eligibility before enqueueing dispatcher HTTP calls. There is
  no immediate network retry loop on an unhealthy database. The next cron retries.
- Maintenance removes at most 500 completed cron-history rows older than 14 days,
  performs a bounded legacy reuse/backfill pass of 25 records, and dispatches clip
  cleanup. The old history drains gradually; this is not an immediate hard cap.
  Running/recent history and product records are preserved. No VACUUM FULL is run.
- Clips retain their one-hour deletion grace period; physical removal can be up
  to an additional hour later without a backlog. Logical revocation is unchanged.
  Cleanup has a 90-second work window plus the final in-flight request; unremoved
  ledger entries remain available to the next hourly pass.

At idle, the expected affected Edge Function baseline becomes 336/day: 288
recovery ticks, 24 maintenance ticks and 24 clip-cleanup calls, versus 4,320/day
previously (about 92% fewer). Real work adds calls. Database API RPCs similarly
become 336/day for this scope; the maintenance RPC contains additional bounded
SQL work. These request reductions are **not** equivalent disk-I/O reductions.
The existing hourly test-back and daily Google Play reminder jobs are separate.

Verification: 66 regression tests passed with one pre-existing skip, including
20 focused scheduler/cutover tests. Deno
type checks and the Cloudflare dry run passed. Live unauthenticated requests
to all three affected endpoints returned 401. Authenticated recovery returned
200 with no eligible work; maintenance returned 200, removed 500 old history
records and dispatched cleanup, whose HTTP response was also 200. The private
scheduler RPC rejects anon/authenticated roles and permits service_role.
Security Advisor's two new informational RLS-without-policy notices are
intentional deny-by-default private bookkeeping tables with client grants revoked;
see [the advisor description](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Other existing advisor notices were not changed by this scoped rollout.

Operational checks (read-only, using an administrator connection):

```sql
select action, last_success_at, result
from private.background_scheduler_health order by action;
select jobname, schedule, active from cron.job order by jobname;
select status, count(*) from public.recording_transcripts group by status;
select status, count(*) from public.recording_clips group by status;
select status, count(*) from public.chat_notification_outbox group by status;
```

An external recovery heartbeat older than 10 minutes or maintenance older than
90 minutes warrants investigation in the Worker's Cron logs and Supabase logs.
The maintenance heartbeat confirms SQL completion and cleanup enqueue, not
successful physical deletion of every object. Do not infer healthy I/O or real
OTP delivery from the scheduler heartbeat. Compare disk budget, I/O wait, Auth
latency and queue age over 48–72 hours and the previous recurrence interval.

Rollback for an external scheduler failure: reactivate the retained three jobs
at five-minute intervals; restore hourly cleanup via the private helper. Keep
the queue triggers and durable work. Disable the external triggers once the
replacement schedule is verified to avoid duplicate maintenance runs.

```sql
select cron.alter_job(jobid, schedule := '*/5 * * * *', active := true)
from cron.job where jobname in
  ('dispatch-recording-transcripts','dispatch-recording-clips','dispatch-chat-notifications');
select cron.schedule('background-maintenance-hourly', '19 * * * *',
  $$select private.background_scheduler_tick('maintain')$$);
```

Deploy only the named migrations and affected Edge Function bundles. The
checkout has unrelated pending migrations and newer transcript schema work;
do not push all migrations or bulk-deploy local shared dependencies. The initial
release preserved each function's deployed dependencies and changed only the
dispatcher entrypoints and clip cleanup time bound.

## Concise incident analysis — October 6, 2026

### Deeper assessment after SQL access recovered (09:50–10:00 EDT)

**Most likely failure mechanism:** recurring disk-I/O throttling on the Nano
instance, with system-level activity and memory swapping the leading suspects
for the missing I/O load. Confidence is stronger for disk-budget pressure than
for attribution to swapping or a particular process. The data does not support
blaming the five queue RPCs as the principal disk consumer. A provider host or
service fault remains a competing explanation for the instance-level symptoms.

At `2026-10-06T13:50:29.448Z`, all four health probes passed: Auth 276 ms,
email settings 516 ms, preflight 143 ms, and zero-row database readiness 569 ms.
Management SQL also succeeded. Postgres reports that it started at 12:19:12 UTC;
no additional restart, schema change, billing change, or statistics reset was
performed in this analysis. Availability has recovered since the 08:40 EDT
failure check; this is not evidence of a permanent correction or a newly tested
real OTP delivery.

Read-only SQL, query plans, and current queue counts now narrow the diagnosis:

| Finding | Implication |
| --- | --- |
| PostgreSQL cache hit rate 99.9765%; 1,400 shared-buffer block reads versus 5,964,858 hits | Ordinary database reads are mostly served from PostgreSQL's cache in this sample. These counters do not measure OS swapping or all host disk activity. |
| Five polling RPCs: 302 recorded calls, 88 shared-buffer block reads (704 KiB), no temporary writes; 1,348 bytes of reported WAL across them | Their measured query I/O is small. Counts alone substantially overstate the case for these queries being the main disk-budget consumer. |
| Read-only equivalent of the live transcript-reuse candidate lookup: 0.344 ms execution, zero read blocks, existing indexes, zero eligible rows | The candidate lookup is cheap on the recovered instance. This did not execute the mutating reuse function or the full dispatcher. |
| No blocked sessions, no recorded deadlocks or temporary-file spills; approximately 22 database connections against a configured maximum of 60 | No current evidence of a locking storm, connection exhaustion, or sorting/hash spills. |
| 39 ready transcripts, seven failed after three attempts, one ready clip; zero pending HTTP-dispatch requests at the later check | No large processing or HTTP queue backlog is visible. The two pending chat notifications are not a large backlog. |
| SQL database size about 47.9 MiB; dashboard separately displays about 62 MB; replication slots retain only about 4 KB at the sampled moment | No current sign of a large import, a full disk, or runaway replication retention. Dashboard and live SQL sizes are different measurements/snapshots. |
| 84,172 cron-history rows dating to April; relation size 18.7 MiB; no retention job among the five active schedules | Scheduler history is avoidable accumulated overhead. This size alone is not enough to explain the outage. |

The query statistics include the slow recovery period: simple indexed cron
history updates took up to about 20 seconds, and an Auth migration-existence
lookup averaged 402 ms despite recording no shared-buffer reads. That pattern
is consistent with a stalled instance affecting trivial work. It does not prove
the cron-history statements themselves generated the underlying I/O load.
Their current incremental timings were much lower. A startup cron-history
cleanup scanned about 16.8 MiB once and took 35 seconds; retaining less history
could improve startup, but this is not evidence that it initiated the outage.

The 09:53 EDT report showed low data-disk activity (about 3 IOPS and 35.3 KB/s)
while the prior infrastructure history showed exhausted I/O budget. The time
windows differ, and available reports do not establish per-process or
system-disk swap-in/swap-out rates. Supabase explicitly distinguishes the system
disk containing swap from the Postgres data disk. Low PostgreSQL block reads
therefore cannot rule out substantial system-disk traffic. See
[memory and swap metrics](https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0).

**Why recovery does not prevent recurrence:** the same instance limits and
continuous background services remain after a restart. Temporary relief from
process/queue pressure can be followed by renewed I/O contention. Budget
replenishment while demand falls is a possible contributor to delayed recovery;
we did not measure the credit balance during that interval and cannot claim
that a restart replenishes disk credits.

**Important limits:** `pg_stat_statements` and I/O statistics reset at the
12:19 UTC restart, so these observations cannot reconstruct pre-outage query
costs. Shared-buffer read counts may be satisfied by the OS page cache; they
are not device IOPS. Both `track_io_timing` and `track_wal_io_timing` are off,
so zero timing fields are not proof of zero I/O wait. Swap occupancy and high
virtual-memory commitment are not proof of active swap thrashing or an OOM kill.

**Recommended next work within the free-plan constraint:** set bounded
scheduler-history retention; reduce redundant transcript-reuse and clip-cleanup
checks; and compare actual I/O/latency before and after a controlled reduction
in nonessential schedules, preserving queued work. Keep this framed as a
measured mitigation, not a confirmed cure. If I/O remains high with application
background work reduced, the evidence points more strongly to host/service
activity or insufficient baseline capacity. A compute resize would address
capacity and memory headroom but requires separate spending authorization.

Performance Advisor returned 30
[unindexed foreign-key notices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
35 [RLS initialization warnings](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
12 [multiple-policy warnings](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies),
and 40 [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
These merit targeted tuning but do not identify this outage's cause. In
particular, index-usage counters cover only the post-restart period; do not drop
indexes merely because this short window reports them unused.

The supplied AI-support reply adds no host-level diagnosis and states that
hands-on investigation is outside Free-plan support. The published
[support policy](https://supabase.com/support-policy) limits technical support
to paid resources. No follow-up message or paid change was sent/performed.

The machine-readable [diagnostic samples](supabase-io-2026-10-06.json) retain
aggregate statistics and the read-only query plan, without customer records,
credentials, or message content. The findings above supersede earlier,
less-specific attribution in the chronological notes below.

### Earlier evidence and chronology

**Updated conclusion:** the confirmed failure is an unresponsive Supabase
database and dependent services, including Auth. Subsequently supplied provider
email and dashboard evidence establish disk I/O budget pressure/exhaustion and
make disk throttling the strongest explanation for the recurring slowdowns.
The process or workload consuming that budget, and its exact causal relationship
to each outage, remain unconfirmed. The evidence does not establish an
out-of-memory kill or prove that the three polling jobs caused the outages.

**Additional evidence reviewed at approximately 09:44 EDT on October 6.** The
owner supplied a Supabase disk-I/O-budget warning. The matching open email was
verified as dated September 17, 2026 at 06:50 in Gmail's displayed timezone,
before the September 20 clip and chat dispatcher deployments. The project's
Infrastructure dashboard now displays **Disk IO 100%** in the September
29–October 6 history chart, with the line at 100% through most of that period.
Disk space usage is separately shown as 4%; space consumption and I/O budget
consumption are different measurements. This supersedes the earlier statement
that no exhausted disk I/O budget had been established.

The hourly report now contains measurements for approximately 08:51–09:44 EDT,
but disk throughput and database connection charts fail to load. Its largest
listed database object is `cron.job_run_details` at 18.73 MB (30.06% of the
displayed database size), demonstrating accumulated scheduler history without
establishing that this table is the source of excessive I/O. No service-recovery
or end-to-end sign-in claim is based on these dashboard readings alone.

Disk I/O measures physical reads/writes and throughput, not API-request counts.
Cached reads may avoid disk access, while one RPC can cause many physical reads
or writes. Scheduler history, HTTP-dispatch queues, job-state updates, WAL, and
memory swapping can also contribute. Attribution requires query/block-I/O and
system/data-disk measurements. Supabase documents that exhausting burst budget
reduces performance to the compute baseline and can make an instance
unresponsive: [High Disk I/O](https://supabase.com/docs/guides/troubleshooting/exhaust-disk-io).

**What happened.** Degradation was visible on October 5, before the final failure
around 04:13–04:14 EDT on October 6. OTP requests, database API requests, and
independent management SQL connections subsequently failed. Successful browser
preflight requests show that the gateway remained reachable. This is broader
than the sign-in form, CORS, or email delivery.

**Evidence reviewed.** Production Postgres, Auth, PostgREST, and gateway logs;
dashboard resource charts; independent health/SQL probes; deployed dispatcher
sources and repository scheduling logic; and five incident records spanning
September 16, September 21–22, September 23, September 27–28, and October 6.

- Between October 5 at 13:00 UTC and October 6 at 08:20 UTC, deduplicated logs
  contained 222 cron-startup timeout events and 24 statement timeouts. Eighteen
  statement timeouts came from `postgres_exporter`, Supabase's monitoring
  process, indicating that the slowdown affected monitoring as well as app work.
- Provider WAL-archive commands failed at 21:19 and 23:40 UTC on October 5.
  Their underlying error was unavailable. These are storage/network investigation
  leads, not proof of full disks or lost data.
- In the final two complete hours inspected, the gateway recorded 311 and 309
  requests: roughly five per minute, with no obvious traffic surge. Five routine
  background RPCs averaged 2.3–2.7 seconds of gateway origin-response latency,
  peaking around 15–16 seconds. These timings are not SQL execution durations.
- Nano resource charts showed swap use, high memory commitment, and I/O wait.
  Cached RAM is reclaimable, commitment is not resident usage, and swap use
  alone does not prove exhaustion. At the initial review, no kernel OOM event,
  exhausted I/O budget, connection-limit failure, or specific runaway query had
  been established; the subsequent disk-budget evidence is recorded above.
  See Supabase's [memory interpretation guidance](https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0).

**Why it recurs.** Earlier restarts restored service without an identified and
verified preventive correction. The project still uses the same Free/Nano
configuration. Three every-minute dispatchers create continuous background work,
including five routine database RPCs per minute even when queues are empty.
This is a plausible contributor worth measuring, not a demonstrated cause:
the first incident predates deployment of the clip and chat dispatchers.
The incidents share symptoms; a single common root cause remains unproven.

**Recovery and next steps.** The October 6 restart at approximately 08:14 EDT
did not restore services. The final check at 08:40 EDT still returned 504 for
Auth health/settings and a 15-second database-readiness timeout. Management SQL
also remained unavailable when checked at approximately 08:33 EDT. An
urgent support ticket was submitted at approximately 08:29 EDT with authorized
diagnostic access and a request for recovery without paid upgrades. Supabase
needs to correlate host/process exits, OOM events, disk/network health, and
archive failures with these timestamps. After recovery, capture query timings,
connection history, queue sizes, and resource measurements before deciding
whether to stagger jobs or reduce empty-queue polling. Neither another restart
nor a paid resize is a proven permanent fix. No application or billing changes
were made for this analysis.

## September 16 confirmed failure chain

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
- The test-account login Edge Function uses the same deadline and error feedback.
  Database requests, other Edge Functions, and recording uploads retain their existing
  transport behavior. Session persistence and refresh remain with the Supabase SDK.

## Read-only health check

Run `npm run auth:check` with the production build's `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key). The command also reads Vite's
production environment files. `AUTH_CHECK_ORIGIN` defaults to `https://test4test.io`.

The check validates real Auth health, email-provider settings, OTP preflight,
database API readiness, and CORS response headers. The database probe reads zero
rows from `submissions` with `select=id&limit=0`; it returns no customer data.
The command prints a UTC timestamp for incident correlation. It never sends an
email, creates a user, or prints a key. A failed probe exits nonzero. Only
browser-safe keys are accepted. Auth becoming healthy before the database API
is ready must not be reported as full recovery.

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

## September 21, 2026 recurrence (EDT)

The local test-account sign-in stalled and eventually displayed `{}`. Independent
read-only probes confirmed Auth health and settings both exceeded 15 seconds;
OTP preflight passed in 72 ms. A database query through the management connector
failed with `Connection terminated due to connection timeout`, although project
metadata still reported `ACTIVE_HEALTHY`. Recovery was subsequently confirmed after
the authorized restart described below.

At approximately 22:07 EDT, the signed-in dashboard reported **Unhealthy**. API
Gateway logs showed password-token HTTP 522 failures at 21:45:53, 21:46:13,
21:48:19, and 21:55:58, and two HTTP 524 failures for
`list_home_trusted_submissions` at 21:46:07. Database observability could not load
memory, CPU, disk, network, or connection metrics. The dashboard's displayed zero
database size during this failure is not a valid measurement. The underlying
host/resource failure remains undetermined. The existing project's restart control
is available; restarting requires approval because it interrupts production services.

With the owner's explicit approval, a full project restart was requested at
02:09:28 UTC on September 22 (22:09:28 EDT on September 21). Supabase acknowledged
the request and reported `RESTARTING`. Postgres started at 02:14:38.901 UTC, and a
02:15:03 UTC query returned 12 connections with zero waiting locks. Auth health and
settings recovered around 02:16 UTC, but an initial test-account login still hit
HTTP 504 while the database API readiness checks returned 503. The zero-row database
API probe subsequently returned HTTP 200. A deliberate login retry succeeded:
by 02:19:11 UTC the authorized test account had reached `/earn`, loaded the test
listings, and displayed its welcome dialog. This confirms login recovery, not just
the health endpoint. No second restart was issued.

Post-restart metrics showed roughly 0.05 GB of database data on an 8 GB disk;
CPU and memory history remained unavailable. The queries observed no blocked
database sessions. These post-recovery measurements do not establish the resource
conditions that caused the outage. This is a recurrence of the earlier availability
incident; a provider/resource investigation remains appropriate if it happens again.

The test-account flow invokes `/functions/v1/test-account-login`, which was outside
the existing `/auth/v1/` deadline. That exact function now receives the same
15-second deadline, including response-body reads. Wrapped function timeouts,
network failures, HTTP 5xx responses, and empty serialized errors receive useful
feedback. Invalid-passcode and rate-limit messages remain actionable. Requests
are not automatically replayed. No backend settings or credentials were changed.

Validation: 36 focused auth tests and all eight sign-in route accessibility/visual
checks passed; the browser displayed the timeout message and released the pending
button. The changes are **Fast-checked**. The full release gate passed formatting,
lint, types, and design-system validation, then stopped on five unrelated founder-tour
tests that require a `window.matchMedia` mock (569 passed, one skipped).

The running local server returned sign-in HTML in 19 ms; a warm browser reload
rendered the passcode form in 449 ms. An isolated cold Vite dependency optimization
took 467 ms. These measurements do not reproduce or establish the cause of the
user's original first-load delay. No Vite configuration change was made.

## September 23, 2026 recurrence (EDT)

Status at 22:47 UTC: **current service recovery is confirmed; durable correction
is still pending**. Backend probes passed at 22:39 UTC, regressed to a database
HTTP 503 at 22:41 UTC, then recovered. The final 22:46:52 UTC check passed all
four probes at normal latency, and the existing user session loads real data.
Automatic approval review initially rejected the production restart because the
action could interrupt live connections. The owner subsequently approved it.
The restart was confirmed in the dashboard at approximately 22:30:16 UTC, and the
management API acknowledged `RESTARTING`. No capacity change, schema change, or
deployment has been performed in this investigation.

### Approved restart and follow-up evidence

Only one restart was issued. Postgres started at 22:34:56.067 UTC. A management
query at 22:35:12 UTC returned 16 connections and zero waiting locks. Auth
recovered before the database API: subsequent database probes returned 503/520
while startup completed. By 22:39:40 UTC, retrying the original browser session
opened `/earn`, loaded real listings, and subsequently loaded profile statistics.
This verifies recovery of an existing authenticated session; a fresh emailed OTP
and email delivery have not been tested in this incident.

The 22:39:45 UTC probe passed all four checks, but Auth health took 5.35 seconds,
settings 4.88 seconds, and database readiness 10.81 seconds. At 22:41:21 UTC,
Auth still passed while database readiness returned HTTP 503 after 11.37 seconds.
At 22:44:59 UTC, a zero-row database request returned HTTP 200 in 862 ms. A single
successful response does not establish sustained availability.

The final full check started at 22:46:52 UTC and passed Auth health (218 ms),
email-provider settings (177 ms), OTP preflight (115 ms), and database readiness
(741 ms). This confirms current recovery after the slow and intermittent startup
period; the recurring outage risk remains unresolved.

Read-only database diagnostics after restart found:

- Approximately ten client connections against `max_connections = 60`, with no
  observed blocked sessions. There is no demonstrated connection storm.
- About 35.8 MiB for `pg_database_size(current_database())`; the dashboard reports
  about 0.05 GB total data on an 8 GB disk. Current billing-cycle usage reports no
  exceeded Free Plan quotas.
- Cron jobs 3, 4, and 5 resumed succeeding at 22:38 and 22:39 UTC after startup
  failures. No deadlocks or temporary-file spills were recorded in the inspected
  post-restart statistics.
- Query statistics were reset during restart, so they cannot identify a query
  responsible for the earlier failure. Early slow queries included platform
  metadata, connection authentication, and Realtime queries. No application query
  or extension has been established as the cause.
- At 22:45 UTC, the instance already had 266.34 MB of swap in use, 406.51 MB
  total RAM, 167.55 MB used, 234.92 MB cache/buffers, and 4.05 MB free. Memory
  commitment was 1.25 GB against a 1.2 GB limit (104.33%). This corroborates
  continuing resource pressure without proving an OOM event.

The recommended capacity mitigation is Small compute (2 GB RAM), alongside a
provider investigation into the recurring host failure. For the current two
active projects in Matt's Startups, the estimated base organization cost is
approximately $40/month: $25 Pro + $15 Small + $10 for the other Nano/Micro
project - $10 compute credits, before taxes, additional usage, or add-ons.
Compute is billed hourly and is not covered by the spend cap. No payment method
is currently configured. The owner has been asked separately to approve the
recurring cost and resize downtime; the restart approval does not cover either.
The prepared support report has also been offered for approval and has not been
sent. No database configuration was changed speculatively.

Both reported screens follow from the unavailable backend:

- With an existing session, `AppStateProvider` cannot validate the user or load
  their profile. `AppStateBoundary` correctly preserves an unknown authentication
  state and shows the page-load failure instead of redirecting to a false signed-out
  state or presenting an empty account.
- In a fresh browser session, the sign-in page can render, but its OTP request
  cannot reach a healthy Auth origin. The existing transport displays the
  service-unavailable message.

Evidence collected before any recovery:

- The production project is `lteimepkxuiupbcsbcpz`, region `us-east-1`, Nano
  (`t4g.nano`, Free organization), Postgres image `17.6.1.084`.
- Auth health and settings returned HTTP 504 in approximately 5.1 seconds;
  preflight passed in 127 ms. A zero-row database API request exceeded its
  15-second deadline. The probe started at `2026-09-23T21:09:43.482Z`.
- A management SQL connection failed with `Connection terminated due to
connection timeout`. Project metadata still said `ACTIVE_HEALTHY`.
- The signed-in dashboard reported **Unhealthy**, **Database not usable**,
  `CONNECT_TIMEOUT` after 5001 ms, and a persistently high Auth failure rate.
- At 20:42 UTC, the transcript, clip, and chat dispatcher cron jobs completed
  normally. At 20:43:12 UTC, all three logged job startup timeouts. The latest
  observed Postgres log in this incident window is at that time. This does not
  establish that these jobs caused the failure.
- API logs include database HTTP 522 failures and 171 Auth token HTTP 504
  responses between 20:49:56 and 21:03:26 UTC in the retrieved window.
- The database observability chart stops at 20:43 UTC. Its last sample shows
  406.52 MB total RAM, 174.68 MB used, 227.41 MB cache/buffers, 4.43 MB free,
  and 348.08 MB swap. Memory commitment is 1.43 GB against a 1.2 GB commit limit
  (119.51%). The preceding chart also shows sustained swap use and commitment
  above the limit. CPU at the final sample is 8.54%, including 6.38% I/O wait;
  measured disk operations are 6 IOPS. The unavailable connection/disk charts and
  displayed zero database size are not valid zero measurements.

**Assessment:** the database service failure is confirmed. Memory pressure is
the strongest resource lead, supported by pre-failure measurements. Linux memory
commitment is a promise of memory, not actual resident usage; exceeding the
displayed limit does not alone prove an OOM kill. Kernel/container events,
process-level memory, and connection history are required to distinguish an OOM
event, service leak, host fault, or another cause. Supabase's public status page
reported separate JWT-401 and restored-project Storage incidents; neither
establishes the cause of this TCP-level database outage.

### Recovery and durable correction

1. The approved restart and read-only database inspection are complete, as
   recorded above. Continue to distinguish temporary recovery from a durable
   correction; do not repeat restarts as the preventive measure.
2. After the chosen correction, require all four `npm run auth:check` probes to
   pass, a successful management SQL connection, and an authorized real sign-in
   with application data. Assess sustained resource headroom as well.
3. Request Supabase host/container evidence using the prepared
   [support draft](supabase-incident-2026-09-23-support-draft.md). Sending it needs
   the owner's authorization. Ask for a specific corrective action covering
   all three recurrences, not just another restart.
4. Address the measured memory pressure. Evaluate a workload/pool adjustment
   based on those observations, or move off Nano to appropriately sized compute.
   Micro provides 1 GB and Small provides 2 GB. Capacity changes require a Pro
   organization and affect billing; review the complete organization cost before
   seeking purchase approval. Do not treat a plan upgrade alone as a compute
   resize: existing Nano projects are not automatically resized.
5. Verify sustained resource headroom and end-to-end availability after the
   chosen correction. A restart or the diagnostic change below is not a proven
   permanent fix. No recurring monitor has been installed by this investigation.

The local health checker now includes a zero-row database-readiness check and a
UTC timestamp, with regressions for partial recovery, unexpected responses, and
legacy anon-key authorization. Validation: 37 focused auth tests passed, along
with formatting, targeted lint, and TypeScript checking. The live failure probe
correctly exits nonzero. This change improves detection; it cannot repair an
unreachable database host.

References:
[memory and commitment interpretation](https://supabase.com/docs/guides/observability/reports#memory-commitment),
[compute sizing and upgrade behavior](https://supabase.com/docs/guides/platform/compute-and-disk),
[organization compute billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute),
[database unavailability troubleshooting](https://supabase.com/docs/guides/troubleshooting/failed-to-retrieve-tables).

## October 6, 2026 recurrence (EDT)

The production OTP requests at 08:07:25 and 08:09:20 EDT returned HTTP 504
after approximately five seconds. Public database RPCs also returned 504/522.
A separate management SQL connection timed out, despite project metadata
reporting `ACTIVE_HEALTHY`. This confirms backend unavailability; the sign-in
form's service-unavailable message reflects the failed Auth request.

The read-only check at `2026-10-06T12:12:01.919Z` reported:

- Auth health: HTTP 504 after 5,273 ms.
- Email settings: HTTP 504 after 5,235 ms.
- OTP preflight: passed in 232 ms.
- Zero-row database readiness: timed out after 15 seconds.

The initial sandboxed probe failed immediately with local `EACCES`; it is not
outage evidence. The measurements above came from the network-enabled rerun.

Before recovery, logs showed cron jobs completing at 08:12 UTC, followed by
startup timeouts and SSL connection resets through 08:14:21 UTC (04:14:21 EDT).
No later Postgres logs appeared in the inspected window. The inspected
07:30–08:15 UTC Postgres logs did not contain an explicit OOM, panic, process
termination, or connection-limit error. PostgREST logged timeout-manager errors.

The dashboard still showed Free/Nano (`t4g.nano`, image `17.6.1.084`). Its
24-hour resource report stopped around the failure window, displaying 406.51 MB
RAM and 1.37 GB committed memory, sustained swap, commitment above the plotted
limit, and substantial I/O wait. These observations support memory/I/O pressure
as a lead; they do not establish an OOM kill, a specific bad query, or a service
leak. The missing current metrics and displayed zero database size are not valid
zero measurements.

One full project restart was submitted through the dashboard at approximately
12:14 UTC to recover the confirmed outage. The dashboard and management API
acknowledged `RESTARTING`. By 12:19 UTC, project metadata again reported
`ACTIVE_HEALTHY`, but the dashboard marked Database, PostgREST, Auth, Realtime,
and Storage unhealthy. Checks at 12:20, 12:21, 12:22, 12:24, 12:25, and
12:29 UTC continued to fail: Auth health/settings returned 502 and the
database API returned 521, while preflight alone passed. A management SQL
connection at 12:20 UTC still timed out. No second restart was issued.

**Status at 12:29 UTC (08:29 EDT): not recovered.** No successful sign-in or
email-delivery verification can be claimed. The provider's restart completion
and project metadata are not evidence that the services work.

The owner requested that recovery remain free and declined the proposed Pro
and Small compute upgrade. The owner then explicitly authorized sending the
prepared support report and allowing support access to the project. At about
12:29 UTC, the dashboard confirmed **Support request sent** and that a ticket
had been logged for Test4Test. Category: Database unresponsive. Severity:
Urgent (production system down). Affected services: Authentication and
Database. The ticket requests recovery on the current Free plan, prohibits
billable upgrades, and includes the recurring failure timeline and resource
evidence. Supabase will reply to the signed-in owner's email address. No ticket
number was shown on the confirmation screen.

The public status page also described an Eastern US latency incident under
monitoring and a management-API incident resolved at 09:03 UTC. Neither notice
establishes the cause of this project's database failure. Relevant source:
[Supabase status](https://status.supabase.com/).

No application code, credentials, RLS policies, or billing settings were
changed. Temporary provider support/AI diagnostic access was allowed with the
owner's explicit approval. Existing unrelated workspace changes were preserved.
This is an operational incident, not a design-system release. Further recovery
currently depends on provider-level service/host repair; no recurring monitor
was installed.
