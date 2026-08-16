import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config } from "./config.js";
import { extractRecordingThumbnail } from "./frameExtractor.js";
import { logger } from "./logger.js";
import { downloadObjectToFile, downloadUrlToFile, uploadFrame } from "./r2Client.js";
import type {
  ProcessRecordingThumbnailsInput,
  ProcessRecordingThumbnailsResult,
  RecordingThumbnailFailure,
  RecordingThumbnailResult,
  RecordingThumbnailSource,
} from "./types.js";

function normalizeBucket(bucket: string | undefined) {
  return (bucket ?? config.r2.sourceBucketName).trim().replace(/^r2:/i, "");
}

export function buildRecordingThumbnailKey(source: RecordingThumbnailSource) {
  return `recording-thumbnails/${source.generationVersion}/${source.recordingUploadId}.webp`;
}

function validateSource(source: RecordingThumbnailSource) {
  if (!source.recordingUploadId || !source.objectKey) {
    throw new Error("Recording thumbnail source is incomplete.");
  }
  if (source.generationVersion !== config.thumbnails.generationVersion) {
    throw new Error("Recording thumbnail generation version is not supported.");
  }
}

async function processSource(
  source: RecordingThumbnailSource,
  workDir: string,
): Promise<RecordingThumbnailResult> {
  validateSource(source);
  const localPath = join(workDir, `${source.recordingUploadId}.video`);

  if (source.url) {
    await downloadUrlToFile(source.url, localPath);
  } else {
    await downloadObjectToFile({
      bucket: normalizeBucket(source.bucket),
      key: source.objectKey,
      destPath: localPath,
    });
  }

  const frame = await extractRecordingThumbnail(localPath);
  const storageKey = buildRecordingThumbnailKey(source);
  await uploadFrame({
    key: storageKey,
    body: frame.buffer,
    contentType: "image/webp",
    metadata: {
      "recording-upload-id": source.recordingUploadId,
      ...(source.responseId ? { "response-id": source.responseId } : {}),
      "recording-object-key": source.objectKey,
      "timestamp-ms": String(frame.timestampMs),
      "duration-ms": String(frame.durationMs),
      "generation-version": source.generationVersion,
    },
  });

  return {
    recordingUploadId: source.recordingUploadId,
    ...(source.responseId ? { responseId: source.responseId } : {}),
    recordingObjectKey: source.objectKey,
    storageBucket: config.r2.bucketName,
    storageKey,
    contentType: "image/webp",
    sizeBytes: frame.buffer.byteLength,
    width: frame.width,
    height: frame.height,
    timestampMs: frame.timestampMs,
    durationMs: frame.durationMs,
    generationVersion: source.generationVersion,
  };
}

export async function processThumbnailSources(
  sources: RecordingThumbnailSource[],
  processOne: (source: RecordingThumbnailSource) => Promise<RecordingThumbnailResult>,
): Promise<ProcessRecordingThumbnailsResult> {
  const successes: RecordingThumbnailResult[] = [];
  const failures: RecordingThumbnailFailure[] = [];

  for (const source of sources) {
    try {
      successes.push(await processOne(source));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        recordingUploadId: source.recordingUploadId,
        recordingObjectKey: source.objectKey,
        error: message,
      });
      logger.warn("Recording thumbnail source failed", {
        recordingUploadId: source.recordingUploadId,
        error: message,
      });
    }
  }

  return { successes, failures };
}

export async function processRecordingThumbnails(
  input: ProcessRecordingThumbnailsInput,
): Promise<ProcessRecordingThumbnailsResult> {
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    throw new Error("At least one recording thumbnail source is required.");
  }
  if (input.sources.length > config.thumbnails.maxBatchSize) {
    throw new Error(
      `Recording thumbnail batches are limited to ${config.thumbnails.maxBatchSize} sources.`,
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "recording-thumbnails-"));
  try {
    return await processThumbnailSources(input.sources, (source) => processSource(source, workDir));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch((error) => {
      logger.warn("Failed to clean recording thumbnail temp directory", {
        workDir,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
