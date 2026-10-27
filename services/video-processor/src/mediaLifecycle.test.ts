import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaExecutor, MediaLifecycle } from "./mediaLifecycle.js";

test("transcripts and clips share one native processing slot, including rejected work", async () => {
  const executor = new MediaExecutor();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  const first = executor.run(async () => {
    calls.push("transcript");
    await blocked;
    throw new Error("provider unavailable");
  });
  const rejected = assert.rejects(first, /provider unavailable/);
  const second = executor.run(async () => {
    calls.push("clip");
  });
  await Promise.resolve();
  assert.deepEqual(calls, ["transcript"]);
  release();
  await Promise.all([rejected, second]);
  assert.deepEqual(calls, ["transcript", "clip"]);
});

test("sleep waits for queued jobs and callbacks, then rejects racing admissions", () => {
  let jobs = 2;
  const lifecycle = new MediaLifecycle(() => jobs);
  assert.equal(lifecycle.prepareToSleep(), false);
  assert.equal(lifecycle.accepting, true);
  jobs = 1; // The last job is still acknowledging its completion.
  assert.equal(lifecycle.prepareToSleep(), false);
  jobs = 0;
  assert.equal(lifecycle.prepareToSleep(), true);
  assert.equal(lifecycle.accepting, false);
});
