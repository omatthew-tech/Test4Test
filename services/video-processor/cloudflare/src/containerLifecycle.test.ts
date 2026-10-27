import assert from "node:assert/strict";
import { test } from "node:test";
import { INACTIVITY_GRACE_MS, MediaContainerLifecycle } from "./containerLifecycle.js";

function fixture() {
  const state = {
    starts: 0,
    probes: 0,
    forwards: 0,
    signals: [] as number[],
    alarms: 0,
    grace: 0,
    idle: false,
    probeFails: false,
    healthFailures: 0,
    observed: 0,
  };
  const runtime = {
    running: false,
    start() {
      state.starts++;
      this.running = true;
    },
    async setInactivityTimeout(ms: number | bigint) {
      state.grace = Number(ms);
    },
    monitor: () => new Promise<void>(() => {}),
    async destroy() {
      state.signals.push(1);
      this.running = false;
    },
    getTcpPort: () =>
      ({
        async fetch(input: RequestInfo | URL, init?: RequestInit) {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (url.endsWith("/healthz")) {
            state.probes++;
            if (state.healthFailures-- > 0) throw new Error("port not ready");
            return Response.json({ ok: true });
          }
          if (url.endsWith("/internal/prepare-sleep")) {
            assert.equal(new Headers(init?.headers).get("x-worker-secret"), "secret");
            if (state.probeFails) throw new Error("temporary failure");
            return Response.json({ idle: state.idle });
          }
        assert.equal(new URL(url).protocol, "http:");
        state.forwards++;
          return Response.json({ ok: true }, { status: 202 });
        },
      }) as Fetcher,
  };
  const lifecycle = new MediaContainerLifecycle(
    runtime,
    {
      async setAlarm() {
        state.alarms++;
      },
    },
    { image: "digest", instance: "standard-2", enableInternet: true },
    "secret",
    () => {
      state.observed++;
    },
    async () => {},
  );
  return { lifecycle, state, runtime };
}

test("concurrent cold requests share startup and wait for application readiness", async () => {
  const { lifecycle, state } = fixture();
  state.healthFailures = 2;
  const responses = await Promise.all(
    [1, 2].map(() => lifecycle.fetch(new Request("https://gateway.test/job"))),
  );
  assert.deepEqual(
    responses.map((r) => r.status),
    [202, 202],
  );
  assert.equal(state.starts, 1);
  assert.equal(state.probes, 3);
  assert.equal(state.forwards, 2);
  assert.equal(state.grace, INACTIVITY_GRACE_MS);
});

test("jobs and pending callbacks survive repeated alarms and transient probe errors", async () => {
  const { lifecycle, state } = fixture();
  await lifecycle.fetch(new Request("http://container/job"));
  for (let i = 0; i < 10; i++) await lifecycle.alarm();
  state.probeFails = true;
  await lifecycle.alarm();
  assert.equal(state.signals.length, 0);
  assert.equal(state.alarms, 12);
  state.probeFails = false;
  state.idle = true;
  await lifecycle.alarm();
  assert.deepEqual(state.signals, [1]);
  const alarms = state.alarms;
  await lifecycle.alarm();
  assert.equal(state.alarms, alarms);
  await lifecycle.fetch(new Request("http://container/job"));
  assert.equal(state.starts, 2);
});

test("restoring a running object restores its background-work grace and idle checks", async () => {
  const { lifecycle, state, runtime } = fixture();
  await lifecycle.restore();
  assert.equal(state.alarms, 0);
  runtime.running = true;
  await lifecycle.restore();
  assert.equal(state.starts, 0);
  assert.equal(state.grace, INACTIVITY_GRACE_MS);
  assert.equal(state.alarms, 1);
  assert.equal(state.observed, 1);
});
