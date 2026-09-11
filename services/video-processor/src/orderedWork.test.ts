import assert from "node:assert/strict";
import test from "node:test";
import { orderedWork } from "./orderedWork.js";

test("uploads concurrently while retaining frame notification order", async () => {
  let active = 0,
    peak = 0;
  const published: number[] = [];
  const results = await orderedWork(
    [4, 3, 2, 1],
    3,
    async (value) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value;
    },
    (value) => {
      published.push(value);
    },
  );
  assert.equal(peak, 3);
  assert.deepEqual(results, [4, 3, 2, 1]);
  assert.deepEqual(published, results);
});
test("failed uploads stop publication and drain other work before cleanup", async () => {
  let finished = false;
  const published: number[] = [];
  await assert.rejects(
    orderedWork(
      [0, 1, 2],
      2,
      async (value) => {
        if (!value) throw Error("failed");
        await new Promise((resolve) => setTimeout(resolve, 5));
        finished = true;
        return value;
      },
      (value) => {
        published.push(value);
      },
    ),
    /failed/,
  );
  assert.equal(finished, true);
  assert.deepEqual(published, []);
});
