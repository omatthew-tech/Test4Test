import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaApp } from "./mediaApp.js";

test("only authenticated media jobs run; idle shutdown waits for completion and fences admissions", async () => {
  const queued: unknown[] = [];
  const queue = {
    get size() {
      return queued.length;
    },
    enqueue(job: unknown) {
      queued.push(job);
    },
  };
  const app = createMediaApp({
    secret: "test-secret",
    transcripts: queue,
    clips: queue,
    parseTranscript: (body) => body,
    parseClip: (body) => body,
    transcriptsConfigured: true,
    clipsConfigured: true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const post = (path: string, secret = "test-secret") =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "x-worker-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: "attempt" }),
    });
  try {
    assert.equal((await post("/recordings/clips/process", "wrong")).status, 401);
    for (const path of ["/reports/process", "/recordings/thumbnails/process", "/frames/sign"])
      assert.equal((await post(path)).status, 410);
    assert.equal(queued.length, 0);
    assert.equal((await post("/recordings/transcripts/process")).status, 202);
    assert.deepEqual(await (await post("/internal/prepare-sleep")).json(), { idle: false });
    assert.equal((await post("/recordings/clips/process")).status, 202);
    queued.length = 0;
    assert.deepEqual(await (await post("/internal/prepare-sleep")).json(), { idle: true });
    assert.equal((await post("/recordings/clips/process")).status, 503);
    assert.equal(queued.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
