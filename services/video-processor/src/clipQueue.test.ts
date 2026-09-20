import assert from "node:assert/strict";
import test from "node:test";
import { ClipQueue } from "./clipQueue.js";
import type { ClipJob } from "./clipProcessor.js";

const job: ClipJob = {
  clipId: "clip",
  attemptId: "attempt",
  startMs: 0,
  endMs: 1000,
  source: { bucket: "recordings", objectKey: "source" },
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
test("caps queued work while allowing already accepted jobs to finish", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new ClipQueue(
    async () => {
      await blocked;
    },
    async () => true,
    async () => {},
    { concurrency: 1, maxPending: 2, heartbeatMs: 60000 },
  );
  queue.enqueue(job);
  queue.enqueue({ ...job, attemptId: "second" });
  assert.throws(() => queue.enqueue({ ...job, attemptId: "third" }), /full/);
  release();
  await settle();
  assert.equal(queue.size, 0);
});
test("bounds work, deduplicates attempts, and refuses a revoked lease before reading media", async () => {
  let ran = 0;
  const queue = new ClipQueue(
    async () => {
      ran++;
    },
    async () => false,
    async () => {},
  );
  queue.enqueue(job);
  queue.enqueue(job);
  await settle();
  assert.equal(ran, 0);
  assert.equal(queue.size, 0);
});
test("discards output when completion is stale", async () => {
  let discarded = 0;
  const queue = new ClipQueue(
    async () => {},
    async (_job, event) => event === "heartbeat",
    async () => {
      discarded++;
    },
  );
  queue.enqueue(job);
  await settle();
  assert.equal(discarded, 1);
});
test("retries an uncertain callback instead of publishing another asset", async () => {
  let calls = 0,
    processed = 0;
  const queue = new ClipQueue(
    async () => {
      processed++;
    },
    async (_job, event) => {
      if (event === "completed" && ++calls < 3) throw new Error("Unavailable");
      return true;
    },
    async () => {
      assert.fail("Accepted output must remain");
    },
    undefined,
    async () => {},
  );
  queue.enqueue(job);
  await settle();
  assert.equal(calls, 3);
  assert.equal(processed, 1);
});
