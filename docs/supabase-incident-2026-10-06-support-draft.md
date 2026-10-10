# Supabase infrastructure escalation draft — October 6 evening (EDT)

Prepared for review; not submitted. No credentials, customer records, or message
content are included.

Subject: Test4Test Auth/database unavailable after project restart

Project: `lteimepkxuiupbcsbcpz` (Test4Test)
Region: `us-east-1`
Compute: Nano (`t4g.nano`), Free plan
Reported Postgres image: `17.6.1.084`
Impact: existing signed-in pages stall and authentication fails. The separately
hosted frontend remains available to unauthenticated visitors.

At 02:48 UTC October 7 (22:48 EDT October 6), independent read-only probes
returned HTTP 504 from `/auth/v1/health` and `/auth/v1/settings` after about five
seconds. A zero-row request to `/rest/v1/submissions?select=id&limit=0` timed out
after 15 seconds. Management SQL also failed with a connection timeout.
`OPTIONS /auth/v1/otp` continued to respond normally. The project metadata
nevertheless reported `ACTIVE_HEALTHY`.

Gateway logs for 02:20–02:49 UTC contained 50 HTTP 504 token responses and three
HTTP 200 token responses. Infrastructure history showed 100% disk-I/O utilization
while live connection metrics were unavailable. Please distinguish historical
resource summaries from live metrics when investigating this incident.

With the owner's approval, exactly one project restart was requested at
approximately 02:58 UTC. A management query at 03:05:04 UTC succeeded and returned:

- `pg_postmaster_start_time()`: `2026-10-07 03:03:39.285301+00`
- 13 connections; two active connections
- Zero observed lock waits and zero observed I/O waits in that single sample

The HTTP services did not recover with that successful query: Auth returned
502/504 or timed out, and database API readiness returned 521 or timed out.
Subsequent management SQL timed out again. At 03:09:26 UTC, Auth still returned
504 and the database API still exceeded 15 seconds. A final check at 03:13:20
UTC, about 15 minutes after the restart request, repeated those same failures.
The dashboard showed
`Unhealthy` and the signed-in application remained on its loading screen.

Earlier on October 6, nonessential background scheduling was reduced: three
minute jobs were disabled in favor of coalesced immediate dispatch and a
five-minute external recovery tick. The recurrence happened despite that
mitigation. Prior recovered-state diagnostics found a small database and no
demonstrated connection or lock storm. Those historical samples cannot identify
the current host-level cause.

Please investigate the project's host and service startup, disk-credit/I/O
throttling, swap/OOM events, and gateway-to-service connectivity. In particular,
why can project metadata report healthy while both independent Auth probes and
management database connections fail? Please advise on recovery within the
current plan or identify a concrete capacity requirement supported by host
metrics. We have not authorized a paid resize, data reset, or schema change.

Latest verified outcome: unresolved at 03:13:20 UTC October 7 (23:13:20 EDT
October 6). Supporting chronology is in `docs/auth-availability.md`.
