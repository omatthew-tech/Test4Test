import express, { type NextFunction, type Request, type Response } from "express";

import { config } from "./config.js";
import { jobQueue } from "./jobQueue.js";
import { logger } from "./logger.js";
import { assertBucketReachable, createSignedObjectUrl } from "./r2Client.js";
import type { VideoSource } from "./types.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

/** Require a shared secret on protected endpoints when one is configured. */
function requireSecret(req: Request, res: Response, next: NextFunction): void {
  if (!config.http.sharedSecret) {
    next();
    return;
  }

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
    const objectKey = typeof candidate.objectKey === "string" ? candidate.objectKey.trim() : undefined;
    const url = typeof candidate.url === "string" ? candidate.url.trim() : undefined;
    const bucket = typeof candidate.bucket === "string" ? candidate.bucket.trim() : undefined;

    if (!responseId || (!objectKey && !url)) {
      continue;
    }

    sources.push({ responseId, objectKey, url, bucket });
  }

  return sources;
}

function normalizeBucketName(bucket: string): string {
  return bucket.trim().replace(/^r2:/i, "");
}

function canSignBucket(bucket: string): boolean {
  const normalized = normalizeBucketName(bucket);

  return normalized === config.r2.bucketName || normalized === config.r2.sourceBucketName;
}

function parseFrameSignRequests(value: unknown): Array<{ id: string; bucket: string; key: string }> {
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
    const bucket = typeof candidate.bucket === "string" ? normalizeBucketName(candidate.bucket) : "";
    const key = typeof candidate.key === "string" ? candidate.key.trim() : "";

    if (!id || !bucket || !key || !canSignBucket(bucket)) {
      continue;
    }

    frames.push({ id, bucket, key });
  }

  return frames;
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
    res.status(400).json({ ok: false, error: "At least one valid source (responseId + objectKey|url) is required." });
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
  } catch (error) {
    logger.error("Could not reach R2 bucket; check Cloudflare credentials.", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  app.listen(config.http.port, () => {
    logger.info("video-processor listening", { port: config.http.port });
  });
}

void start();
