import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config } from "./config.js";
import { extractUniqueFrames } from "./frameExtractor.js";
import { logger } from "./logger.js";
import {
  downloadObjectToFile,
  downloadUrlToFile,
  uploadFrame,
  uploadManifest,
} from "./r2Client.js";
import type {
  ExtractedFrame,
  ProcessReportHooks,
  ProcessReportInput,
  ProcessReportResult,
  VideoSource,
} from "./types.js";

/** Pad a millisecond offset to a sortable, filename-safe token (e.g. 0001234). */
function timestampToken(timestampMs: number): string {
  return String(timestampMs).padStart(8, "0");
}

function buildFrameKey(reportId: string, responseId: string, frameIndex: number, timestampMs: number) {
  const index = String(frameIndex).padStart(4, "0");
  return `reports/${reportId}/${responseId}/${index}-${timestampToken(timestampMs)}ms.webp`;
}

async function downloadSource(source: VideoSource, destPath: string): Promise<void> {
  if (source.url) {
    await downloadUrlToFile(source.url, destPath);
    return;
  }

  if (source.objectKey) {
    await downloadObjectToFile({
      bucket: source.bucket ?? config.r2.sourceBucketName,
      key: source.objectKey,
      destPath,
    });
    return;
  }

  throw new Error(`Source for response ${source.responseId} has neither url nor objectKey.`);
}

async function processSource(
  reportId: string,
  source: VideoSource,
  workDir: string,
  hooks: ProcessReportHooks = {},
): Promise<ExtractedFrame[]> {
  const localPath = join(workDir, `${source.responseId}.video`);
  await downloadSource(source, localPath);

  const candidates = await extractUniqueFrames(localPath);
  const frames: ExtractedFrame[] = [];

  for (let frameIndex = 0; frameIndex < candidates.length; frameIndex += 1) {
    const candidate = candidates[frameIndex];
    if (!candidate) {
      continue;
    }

    const storageKey = buildFrameKey(reportId, source.responseId, frameIndex, candidate.timestampMs);

    await uploadFrame({
      key: storageKey,
      body: candidate.buffer,
      contentType: "image/webp",
      // The exact timestamp travels WITH the object as R2 metadata, in addition
      // to being recorded in the manifest / returned result.
      metadata: {
        "report-id": reportId,
        "response-id": source.responseId,
        "frame-index": String(frameIndex),
        "timestamp-ms": String(candidate.timestampMs),
        "perceptual-hash": candidate.perceptualHash,
      },
    });

    const frame: ExtractedFrame = {
      responseId: source.responseId,
      frameIndex,
      timestampMs: candidate.timestampMs,
      storageBucket: config.r2.bucketName,
      storageKey,
      width: candidate.width,
      height: candidate.height,
      contentType: "image/webp",
      sizeBytes: candidate.buffer.byteLength,
      perceptualHash: candidate.perceptualHash,
    };

    frames.push(frame);
    await hooks.onFrame?.(frame);
  }

  return frames;
}

/**
 * Process every source recording for a report: download, extract unique
 * timestamped frames, upload them to R2, then write a manifest. Returns the full
 * frame list so the caller (or a completion webhook) can persist references.
 */
export async function processReport(
  input: ProcessReportInput,
  hooks: ProcessReportHooks = {},
): Promise<ProcessReportResult> {
  if (!input.reportId) {
    throw new Error("reportId is required.");
  }

  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    throw new Error("At least one video source is required.");
  }

  const workDir = await mkdtemp(join(tmpdir(), `report-${input.reportId}-`));
  const frames: ExtractedFrame[] = [];

  try {
    for (const source of input.sources) {
      logger.info("Processing source", { reportId: input.reportId, responseId: source.responseId });
      const sourceFrames = await processSource(input.reportId, source, workDir, hooks);
      frames.push(...sourceFrames);
    }

    const manifestKey = `reports/${input.reportId}/manifest.json`;
    const result: ProcessReportResult = {
      reportId: input.reportId,
      sourceCount: input.sources.length,
      frameCount: frames.length,
      frames,
      manifestKey,
    };

    await uploadManifest(manifestKey, {
      ...result,
      generatedAt: new Date().toISOString(),
    });

    logger.info("Report processing complete", {
      reportId: input.reportId,
      frameCount: frames.length,
      sourceCount: input.sources.length,
    });

    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch((error) => {
      logger.warn("Failed to clean temp dir", {
        workDir,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
