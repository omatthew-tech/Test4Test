import express, { type NextFunction, type Request, type Response } from "express";

import { drainProtectedThumbnailBackfill } from "./backfillController.js";
import { config } from "./config.js";
import { jobQueue } from "./jobQueue.js";
import { logger } from "./logger.js";
import { assertBucketReachable, createSignedObjectUrl, deleteObjects } from "./r2Client.js";
import { thumbnailQueue } from "./thumbnailQueue.js";
import type { RecordingThumbnailSource, VideoSource } from "./types.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

/** Require the configured shared secret on every protected endpoint. */
function requireSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header("x-worker-secret")?.trim();
  if (provided && provided === config.http.sharedSecret) {
    next();
    return;
  }

  res.status(401).json({ ok: false, error: "Unauthorized." });
}

function parseSources(value: unknown): VideoSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sources: VideoSource[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const responseId = typeof candidate.responseId === "string" ? candidate.responseId.trim() : "";
    const objectKey =
      typeof candidate.objectKey === "string" ? candidate.objectKey.trim() : undefined;
    const url = typeof candidate.url === "string" ? candidate.url.trim() : undefined;
    const bucket = typeof candidate.bucket === "string" ? candidate.bucket.trim() : undefined;
    const transcriptCached = candidate.transcriptCached === true;

    if (!responseId || (!objectKey && !url)) {
      continue;
    }

    sources.push({ responseId, objectKey, url, bucket, transcriptCached });
  }

  return sources;
}

function normalizeBucketName(bucket: string): string {
  return bucket.trim().replace(/^r2:/i, "");
}

function canSignBucket(bucket: string): boolean {
  const normalized = normalizeBucketName(bucket);

  return (
    normalized === config.r2.bucketName ||
    normalized === config.r2.sourceBucketName ||
    normalized === config.thumbnails.bucketName
  );
}

function parseFrameSignRequests(
  value: unknown,
): Array<{ id: string; bucket: string; key: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const frames: Array<{ id: string; bucket: string; key: string }> = [];
  for (const entry of value.slice(0, 200)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const bucket =
      typeof candidate.bucket === "string" ? normalizeBucketName(candidate.bucket) : "";
    const key = typeof candidate.key === "string" ? candidate.key.trim() : "";

    if (!id || !bucket || !key || !canSignBucket(bucket)) {
      continue;
    }

    frames.push({ id, bucket, key });
  }

  return frames;
}

function parseThumbnailSources(value: unknown): RecordingThumbnailSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sources: RecordingThumbnailSource[] = [];
  for (const entry of value.slice(0, config.thumbnails.maxBatchSize)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const recordingUploadId =
      typeof candidate.recordingUploadId === "string" ? candidate.recordingUploadId.trim() : "";
    const responseId = typeof candidate.responseId === "string" ? candidate.responseId.trim() : "";
    const objectKey =
      typeof candidate.objectKey === "string" ? candidate.objectKey.trim().replace(/^\/+/, "") : "";
    const bucket = typeof candidate.bucket === "string" ? candidate.bucket.trim() : "";
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    const generationVersion =
      typeof candidate.generationVersion === "string" ? candidate.generationVersion.trim() : "";
    const durationSeconds =
      typeof candidate.durationSeconds === "number" &&
      Number.isFinite(candidate.durationSeconds) &&
      candidate.durationSeconds > 0
        ? candidate.durationSeconds
        : undefined;

    if (
      !recordingUploadId ||
      !objectKey ||
      generationVersion !== config.thumbnails.generationVersion ||
      (url && !url.startsWith("https://")) ||
      (bucket && normalizeBucketName(bucket) !== config.r2.sourceBucketName)
    ) {
      continue;
    }

    sources.push({
      recordingUploadId,
      ...(responseId ? { responseId } : {}),
      objectKey,
      ...(bucket ? { bucket: normalizeBucketName(bucket) } : {}),
      ...(url ? { url } : {}),
      ...(durationSeconds ? { durationSeconds } : {}),
      generationVersion,
    });
  }

  return sources;
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "video-processor", time: new Date().toISOString() });
});

app.post("/frames/sign", requireSecret, async (req: Request, res: Response) => {
  const frames = parseFrameSignRequests(req.body?.frames);

  if (frames.length === 0) {
    res.status(400).json({ ok: false, error: "At least one valid frame is required." });
    return;
  }

  let signedFrames: Array<{ id: string; url: string }>;

  try {
    signedFrames = await Promise.all(
      frames.map(async (frame) => ({
        id: frame.id,
        url: await createSignedObjectUrl({
          bucket: frame.bucket,
          key: frame.key,
          expiresInSeconds: 60 * 60,
        }),
      })),
    );
  } catch (error) {
    logger.warn("Frame signing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({ ok: false, error: "Frame URLs could not be signed." });
    return;
  }

  res.json({ ok: true, frames: signedFrames });
});

app.post("/frames/delete", requireSecret, async (req: Request, res: Response) => {
  const frames = parseFrameSignRequests(req.body?.frames).filter(
    (frame) =>
      frame.bucket === config.thumbnails.bucketName && frame.key.startsWith("recording-thumbnails/"),
  );

  if (frames.length === 0) {
    res
      .status(400)
      .json({ ok: false, error: "At least one generated recording thumbnail is required." });
    return;
  }

  try {
    await deleteObjects({
      bucket: config.thumbnails.bucketName,
      keys: frames.map((frame) => frame.key),
    });
    res.json({ ok: true, deletedIds: frames.map((frame) => frame.id) });
  } catch (error) {
    logger.warn("Recording thumbnail deletion failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({ ok: false, error: "Recording thumbnails could not be deleted." });
  }
});

app.post("/recordings/thumbnails/process", requireSecret, (req: Request, res: Response) => {
  const sources = parseThumbnailSources(req.body?.sources);

  if (sources.length === 0) {
    res.status(400).json({
      ok: false,
      error: "At least one valid recording thumbnail source is required.",
    });
    return;
  }

  try {
    const job = thumbnailQueue.enqueue({ sources });
    res.status(202).json({
      ok: true,
      jobId: job.id,
      status: job.status,
      sourceCount: job.sourceCount,
      statusUrl: `/recordings/thumbnails/jobs/${job.id}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recording thumbnail queue rejected the job.";
    res.status(message.includes("queue is full") ? 503 : 400).json({ ok: false, error: message });
  }
});

app.get("/recordings/thumbnails/jobs/:jobId", requireSecret, (req: Request, res: Response) => {
  const job = thumbnailQueue.get(req.params.jobId ?? "");
  if (!job) {
    res.status(404).json({ ok: false, error: "Recording thumbnail job not found." });
    return;
  }
  res.json({ ok: true, job });
});

/**
 * Enqueue a report-processing job (ASYNCHRONOUS).
 *
 * Returns 202 Accepted immediately with a jobId. The heavy lifting runs in the
 * background; clients poll GET /jobs/:jobId for progress.
 */
app.post("/reports/process", requireSecret, (req: Request, res: Response) => {
  const reportId = typeof req.body?.reportId === "string" ? req.body.reportId.trim() : "";
  const sources = parseSources(req.body?.sources);

  if (!reportId) {
    res.status(400).json({ ok: false, error: "reportId is required." });
    return;
  }

  if (sources.length === 0) {
    res.status(400).json({
      ok: false,
      error: "At least one valid source (responseId + objectKey|url) is required.",
    });
    return;
  }

  const job = jobQueue.enqueue({ reportId, sources });

  res.status(202).json({
    ok: true,
    jobId: job.id,
    reportId: job.reportId,
    status: job.status,
    statusUrl: `/jobs/${job.id}`,
  });
});

/** Poll job status / result. */
app.get("/jobs/:jobId", requireSecret, (req: Request, res: Response) => {
  const jobId = req.params.jobId ?? "";
  const job = jobQueue.get(jobId);

  if (!job) {
    res.status(404).json({ ok: false, error: "Job not found." });
    return;
  }

  res.json({ ok: true, job });
});

async function start(): Promise<void> {
  try {
    await assertBucketReachable();
    logger.info("Connected to R2 bucket", { bucket: config.r2.bucketName });
    if (config.thumbnails.bucketName !== config.r2.bucketName) {
      await assertBucketReachable(config.thumbnails.bucketName);
      logger.info("Connected to R2 thumbnail bucket", { bucket: config.thumbnails.bucketName });
    }
  } catch (error) {
    logger.error("Could not reach R2 bucket; check Cloudflare credentials.", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  app.listen(config.http.port, () => {
    logger.info("video-processor listening", { port: config.http.port });
    setTimeout(() => void drainProtectedThumbnailBackfill(), 15_000);
  });
}

void start();
