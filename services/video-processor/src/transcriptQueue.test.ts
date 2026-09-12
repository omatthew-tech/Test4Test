import assert from "node:assert/strict";
import test from "node:test";
import {
  TranscriptQueue,
  createTranscriptNotifier,
  type TranscriptJobInput,
  type TranscriptNotifier,
} from "./transcriptQueue.js";
import type { ResponseTranscript } from "./types.js";

const input: TranscriptJobInput = {
  responseId: "response-1",
  attemptId: "attempt-1",
  source: { bucket: "test-recordings", objectKey: "test.webm" },
};
const result: ResponseTranscript = {
  responseId: input.responseId,
  provider: "groq",
  model: "test",
  fullText: "Private transcript",
  segments: [],
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function drained(queue: TranscriptQueue) {
  for (let i = 0; i < 100 && queue.size; i++) await tick();
  assert.equal(queue.size, 0);
}

test("transcript queue deduplicates a live attempt", async () => {
  let release: (() => void) | undefined;
  let calls = 0;
  const queue = new TranscriptQueue(
    async () => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return result;
    },
    async () => true,
  );
  queue.enqueue(input);
  queue.enqueue(input);
  await tick();
  assert.equal(calls, 1);
  assert.equal(queue.size, 1);
  release?.();
  await drained(queue);
});

test("versions of one response complete independently with their source identities", async () => {
  const callbacks: { responseId: string; versionId: string; event: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    callbacks.push(JSON.parse(String(init?.body)));
    return Response.json({ accepted: true });
  };
  try {
    const queue = new TranscriptQueue(
      async () => result,
      createTranscriptNotifier("https://example.invalid/callback", "test-secret"),
    );
    queue.enqueue({ ...input, versionId: "original" });
    queue.enqueue({ ...input, versionId: "revision", attemptId: "attempt-2" });
    await drained(queue);
    assert.deepEqual(
      callbacks
        .filter((row) => row.event === "completed")
        .map((row) => [row.responseId, row.versionId]),
      [
        [input.responseId, "original"],
        [input.responseId, "revision"],
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a stale or deleted-source lease prevents reading media", async () => {
  let calls = 0;
  const queue = new TranscriptQueue(
    async () => {
      calls++;
      return result;
    },
    async () => false,
  );
  queue.enqueue(input);
  await drained(queue);
  assert.equal(calls, 0);
});

test("completion is retried without retranscribing and job content is released", async () => {
  let reads = 0,
    callbacks = 0;
  const queue = new TranscriptQueue(
    async () => {
      reads++;
      return result;
    },
    async (_job, event) => {
      if (event === "completed" && ++callbacks < 3) throw new Error("offline");
      return true;
    },
    { concurrency: 1, maxPending: 2, heartbeatMs: 60_000 },
    async () => undefined,
  );
  queue.enqueue(input);
  await drained(queue);
  assert.equal(reads, 1);
  assert.equal(callbacks, 3);
});

test("provider errors never enter callback payloads and do not block other recordings", async () => {
  const events: Array<{ id: string; event: string; result: ResponseTranscript | undefined }> = [];
  const notify: TranscriptNotifier = async (job, event, data) => {
    events.push({ id: job.attemptId, event, result: data });
    return true;
  };
  const queue = new TranscriptQueue(async (job) => {
    if (job.attemptId === "attempt-1") throw new Error("secret signed URL");
    return result;
  }, notify);
  queue.enqueue(input);
  queue.enqueue({ ...input, attemptId: "attempt-2" });
  await drained(queue);
  assert.ok(
    events.some((entry) => entry.id === "attempt-1" && entry.event === "failed" && !entry.result),
  );
  assert.ok(events.some((entry) => entry.id === "attempt-2" && entry.event === "completed"));
  assert.ok(!JSON.stringify(events).includes("secret signed URL"));
});

test("worker capacity is bounded and existing attempts remain idempotent when full", async () => {
  let release: (() => void) | undefined;
  const queue = new TranscriptQueue(
    async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return result;
    },
    async () => true,
    { concurrency: 1, maxPending: 1, heartbeatMs: 60_000 },
  );
  queue.enqueue(input);
  queue.enqueue(input);
  assert.throws(() => queue.enqueue({ ...input, attemptId: "other" }), /full/);
  await tick();
  release?.();
  await drained(queue);
});
