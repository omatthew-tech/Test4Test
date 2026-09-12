import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "./config.js";
import { downloadObjectToFile } from "./r2Client.js";
import { transcribeRecording } from "./transcription.js";
import type { TranscriptJobInput } from "./transcriptQueue.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTranscriptJob(value: unknown): TranscriptJobInput | null {
  if (!value || typeof value !== "object") return null;
  const job = value as TranscriptJobInput;
  if (!uuid.test(job.responseId) || !uuid.test(job.attemptId) || !job.source) return null;
  if (job.versionId !== undefined && !uuid.test(job.versionId)) return null;
  if (typeof job.source.url === "string") {
    try {
      const url = new URL(job.source.url);
      const callback = new URL(config.transcription.completionWebhookUrl);
      if (
        url.origin !== callback.origin ||
        !url.pathname.startsWith("/storage/v1/object/sign/") ||
        url.username ||
        url.password ||
        (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      )
        return null;
      return {
        ...(job.versionId ? { versionId: job.versionId } : {}),
        responseId: job.responseId,
        attemptId: job.attemptId,
        source: { url: url.href },
      };
    } catch {
      return null;
    }
  }
  if (
    job.source.bucket !== config.r2.sourceBucketName ||
    typeof job.source.objectKey !== "string" ||
    !job.source.objectKey
  )
    return null;
  return {
    responseId: job.responseId,
    ...(job.versionId ? { versionId: job.versionId } : {}),
    attemptId: job.attemptId,
    source: { bucket: job.source.bucket, objectKey: job.source.objectKey },
  };
}

export async function processRecordingTranscript(job: TranscriptJobInput) {
  const workDir = await mkdtemp(join(tmpdir(), "recording-transcript-"));
  const sourcePath = join(workDir, "source.video");
  try {
    if (job.source.url) {
      // The legacy download helper logs URLs in debug mode; this private path never does.
      const response = await fetch(job.source.url, {
        redirect: "error",
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok || !response.body) throw new Error("Recording source unavailable.");
      await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(sourcePath),
      );
    } else if (job.source.bucket && job.source.objectKey) {
      await downloadObjectToFile({
        bucket: job.source.bucket,
        key: job.source.objectKey,
        destPath: sourcePath,
      });
    } else {
      throw new Error("Recording source unavailable.");
    }
    return await transcribeRecording(sourcePath, workDir, job.responseId);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
