import assert from "node:assert/strict";
import test from "node:test";

process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_ACCESS_KEY_ID = "test-key";
process.env.CLOUDFLARE_SECRET_ACCESS_KEY = "test-secret";
process.env.CLOUDFLARE_BUCKET_NAME = "usability-test-screenshots";
process.env.CLOUDFLARE_SOURCE_BUCKET_NAME = "test-response-recordings";
process.env.CLOUDFLARE_ENDPOINT = "https://example.invalid";
process.env.WORKER_SHARED_SECRET = "test-worker-secret";
process.env.THUMBNAIL_COMPLETION_WEBHOOK_URL = "";

const generationVersion = "scene-after-half-v1";

function source(id: string) {
  return {
    recordingUploadId: id,
    objectKey: `draft/user/${id}.webm`,
    bucket: "test-response-recordings",
    generationVersion,
  };
}

function result(id: string) {
  return {
    recordingUploadId: id,
    recordingObjectKey: `draft/user/${id}.webm`,
    storageBucket: "usability-test-screenshots",
    storageKey: `recording-thumbnails/${generationVersion}/${id}.webp`,
    contentType: "image/webp" as const,
    sizeBytes: 100,
    width: 960,
    height: 540,
    timestampMs: 550,
    durationMs: 1000,
    generationVersion,
  };
}

test("batch processing preserves successes when another source fails", async () => {
  const { processThumbnailSources } = await import("./thumbnailProcessor.js");
  const sources = [source("one"), source("two")];
  const processed = await processThumbnailSources(sources, async (entry) => {
    if (entry.recordingUploadId === "two") {
      throw new Error("corrupt recording");
    }
    return result(entry.recordingUploadId);
  });

  assert.deepEqual(
    processed.successes.map((entry) => entry.recordingUploadId),
    ["one"],
  );
  assert.deepEqual(processed.failures, [
    {
      recordingUploadId: "two",
      recordingObjectKey: "draft/user/two.webm",
      error: "corrupt recording",
    },
  ]);
});

test("queue returns the same in-flight job for an idempotent retry", async () => {
  const { RecordingThumbnailQueue } = await import("./thumbnailQueue.js");
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new RecordingThumbnailQueue(1, 4, async (input) => {
    await pending;
    return {
      successes: input.sources.map((entry) => result(entry.recordingUploadId)),
      failures: [],
    };
  });
  const input = { sources: [source("same")] };
  const first = queue.enqueue(input);
  const second = queue.enqueue(input);

  assert.equal(second.id, first.id);
  release?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("queue rejects work beyond its configured bound", async () => {
  const { RecordingThumbnailQueue } = await import("./thumbnailQueue.js");
  const queue = new RecordingThumbnailQueue(1, 1, async () => new Promise(() => undefined));
  queue.enqueue({ sources: [source("one")] });
  assert.throws(() => queue.enqueue({ sources: [source("two")] }), /queue is full/i);
});
