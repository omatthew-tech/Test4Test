# Supabase support report — October 6 request sent

## Current request sent October 6, 2026

Submission confirmed in the Supabase dashboard at approximately 12:29 UTC
(08:29 EDT). The owner approved both sending this report and allowing support
access. Category: Database unresponsive; severity: Urgent; services:
Authentication and Database. The dashboard confirmed the ticket was logged for
Test4Test and will reply to the signed-in owner; no ticket number was displayed.
No paid upgrade was requested or performed. The 12:29 UTC health check still
returned Auth 502 and database API 521.

The subject and message submitted were:

Subject: Test4Test production database/Auth unavailable; restart has not recovered services

Project `lteimepkxuiupbcsbcpz`, organization Matt's Startups, region `us-east-1`,
Free/Nano `t4g.nano`, Postgres image `17.6.1.084`.

Production sign-in is unavailable. At 12:07:25 and 12:09:20 UTC on October 6,
OTP requests returned HTTP 504 after about five seconds. Database RPCs returned
504/522 and management SQL connections timed out. Project metadata still said
`ACTIVE_HEALTHY`.

Postgres cron jobs completed at 08:12 UTC, then logged startup timeouts and SSL
connection resets through 08:14:21 UTC. Logs and resource metrics stopped near
that time. Before recovery, the 24-hour dashboard showed 406.51 MB RAM,
1.37 GB memory commitment above the plotted limit, sustained swap, and high
I/O wait. These observations do not prove an OOM; no explicit OOM, panic, or
connection-limit error appeared in the inspected Postgres logs.

One full project restart was submitted around 12:14 UTC and acknowledged as
`RESTARTING`. By 12:19 UTC the project metadata again said `ACTIVE_HEALTHY`,
but the dashboard marked Database, PostgREST, Auth, Realtime, and Storage
unhealthy. At 12:24:14 UTC, Auth health/settings still returned HTTP 502 and
the zero-row database API probe returned HTTP 521. OTP preflight alone passed.
No post-restart Postgres/Auth logs appeared in the inspected startup window.

Similar outages required restarts on September 16, September 21–22,
September 23, and September 27–28. Please restore this project's services and
inspect host/container startup, kernel/cgroup OOM events, process exits, and
disk/network health. Please identify the recurring failure and a corrective
action available on the current Free plan. Do not apply billable upgrades.

We have not changed credentials, RLS, SMTP, schema, or billing to troubleshoot
this incident. This report contains no customer data or credentials. Historical
evidence follows for reference; only this current section is intended for the
next support submission.

## Historical September 23 draft (not separately sent)

Subject: Recurring complete database unavailability on Test4Test; host-level RCA requested

Project: `lteimepkxuiupbcsbcpz` (Test4Test), `us-east-1`, Free/Nano `t4g.nano`,
Postgres image `17.6.1.084`.

Our production app has suffered repeated database/Auth outages on September 16,
September 21–22, and September 23, 2026. Restarts restored service after the first
two incidents. We need the underlying failure identified and corrected.

An owner-approved restart was requested at 22:30:16 UTC on September 23.
Postgres started at 22:34:56 UTC. The existing app session recovered by 22:39:40
UTC, but recovery was intermittent: all probes passed slowly at 22:39:45 UTC;
the zero-row database API probe returned 503 after 11.37 seconds at 22:41 UTC;
and it returned 200 in 862 ms at 22:44:59 UTC. All four checks passed at normal
latency at 22:46:52 UTC (Auth 218 ms, settings 177 ms, preflight 115 ms, database
741 ms). Only one restart was issued. Current recovery is confirmed, but the
recurring outage risk remains unresolved.

For the latest incident, please investigate **2026-09-23 20:30–21:10 UTC**, with
particular attention to **20:42–20:43 UTC**:

- Cron jobs 3, 4, and 5 completed normally at 20:42 UTC, then reported startup
  timeouts at 20:43:12 UTC. Database metrics stop at 20:43 UTC.
- Auth health/settings return HTTP 504 in about five seconds; OTP OPTIONS
  succeeds. Database API calls return 522 or exceed a 15-second probe deadline.
- Management SQL fails with a connection timeout. Dashboard health reports
  `Database not usable` / TCP `CONNECT_TIMEOUT` after 5001 ms, while project
  metadata still reports `ACTIVE_HEALTHY`.
- Last memory sample: 406.52 MB total RAM, 174.68 MB used, 227.41 MB cache/buffers,
  4.43 MB free, 348.08 MB swap. Memory committed: 1.43 GB vs 1.2 GB commit limit
  (119.51%). The preceding samples show sustained swap and commitment above the
  limit. CPU: 8.54%, including 6.38% I/O wait. Disk operations: 6 IOPS.
- At 22:45 UTC after restart: 406.51 MB RAM, 167.55 MB used, 234.92 MB
  cache/buffers, 4.05 MB free, 266.34 MB swap. Memory commitment was 1.25 GB
  against a 1.2 GB limit (104.33%).
- After restart, approximately ten client connections were observed against a
  limit of 60, with no blocked sessions, deadlocks, or temporary-file spills
  observed. Current billing-cycle usage shows no exceeded quotas. The dashboard
  reports about 0.05 GB data on an 8 GB disk. Pre-failure query statistics are no
  longer available following restart.

Please provide:

1. Kernel OOM/cgroup events, service exits, host/container failures, and the
   identity of any terminated or stalled process around 20:43 UTC.
2. Process memory, connection/pool counts, and disk/host health leading up to the
   failure. Is the pressure from workload, a service/extension leak, or a platform
   issue? Please distinguish committed virtual memory from resident memory.
3. Whether a supported image/extension upgrade or host replacement is needed,
   and an evidence-based recommendation for compute or pool sizing.
4. Why this instance does not recover automatically and why metadata remains
   healthy while TCP connections and Auth fail.

A restart has provided only temporary recovery. Please identify the corrective action
that will prevent the same failure from recurring, and how we should validate it.

This draft contains no API keys, passwords, tokens, customer records, or emails.

## October 6 follow-up evidence (not sent)

The same project failed again after another recovery restart on September 28
at 00:00 UTC. On October 6, Postgres cron jobs completed at 08:12 UTC, then
reported startup timeouts and SSL connection resets through 08:14:21 UTC.
Postgres logs and database metrics subsequently stopped. Please investigate
the host and container events around **2026-10-06 07:30–08:20 UTC** as well.

At 12:07:25 and 12:09:20 UTC, production `POST /auth/v1/otp` requests returned
HTTP 504 after about five seconds. Database RPCs returned 504/522. A management
SQL connection timed out, while project metadata reported `ACTIVE_HEALTHY`.
Independent probes at 12:12 UTC returned Auth health/settings 504, successful
OTP OPTIONS, and a zero-row database API timeout after 15 seconds.

The pre-recovery dashboard still identified Free/Nano `t4g.nano` with image
`17.6.1.084`. Its 24-hour report displayed 406.51 MB RAM, 1.37 GB committed
memory, sustained swap, commitment above the plotted limit, and substantial
I/O wait. Current metrics were unavailable. The inspected Postgres logs did
not contain an explicit OOM, panic, termination, or connection-limit error.
Please distinguish memory commitment from resident usage and confirm the
actual host-level failure using evidence unavailable in project logs.

A single full project restart was requested at approximately 12:14 UTC on
October 6 and acknowledged as `RESTARTING`. The operational recovery result is
recorded in [the availability incident log](auth-availability.md#october-6-2026-recurrence-edt).

Please identify a durable corrective action rather than relying on repeated
restarts. In particular, confirm whether an image/extension defect, resource
limit, or host failure is responsible and whether Small compute is sufficient
to prevent recurrence for this workload.
