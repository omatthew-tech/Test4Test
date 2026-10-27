import assert from "node:assert/strict";
import { test } from "node:test";
import { routeMediaRequest, type MediaBinding } from "./routing.js";

test("probes, unauthorized requests, malformed jobs, and retired routes never wake compute", async () => {
  let calls = 0;
  const env = {
    WORKER_SHARED_SECRET: "secret",
    MEDIA: {
      idFromName() {
        calls++;
        throw new Error("Unexpected start");
      },
    } as unknown as MediaBinding,
  };
  for (const [path, method, secret, body, status] of [
    ["/healthz", "GET", "", undefined, 200],
    ["/recordings/clips/process", "POST", "wrong", "{}", 401],
    ["/reports/process", "POST", "secret", "{}", 410],
    ["/recordings/thumbnails/process", "POST", "secret", "{}", 410],
    ["/internal/prepare-sleep", "POST", "secret", "{}", 410],
    ["/recordings/clips/process", "POST", "secret", "{}", 400],
    ["/recordings/clips/process", "POST", "secret", "x".repeat(16385), 413],
  ] as const) {
    const response = await routeMediaRequest(
      new Request(`https://media.test${path}`, {
        method,
        headers: { "x-worker-secret": secret },
        body,
      }),
      env,
    );
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

test("accepted jobs use one instance and startup failures return retryable busy", async () => {
  let name = "",
    fail = false;
  const env = {
    WORKER_SHARED_SECRET: "secret",
    MEDIA: {
      idFromName(value: string) {
        name = value;
        return {} as DurableObjectId;
      },
      get() {
        return {
          async submitMedia(request: Request) {
            assert.equal(new URL(request.url).protocol, "http:");
            assert.equal(request.headers.get("x-worker-secret"), "secret");
            if (fail) throw new Error("startup");
            return Response.json({ ok: true }, { status: 202 });
          },
        };
      },
    },
  };
  const request = () =>
    new Request("https://media.test/recordings/transcripts/process", {
      method: "POST",
      headers: { "x-worker-secret": "secret" },
      body: JSON.stringify({ attemptId: "attempt", source: { objectKey: "source" } }),
    });
  assert.equal((await routeMediaRequest(request(), env)).status, 202);
  assert.equal(name, "media");
  fail = true;
  assert.equal((await routeMediaRequest(request(), env)).status, 503);
});
