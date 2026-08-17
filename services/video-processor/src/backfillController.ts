import { config } from "./config.js";
import { logger } from "./logger.js";
import { thumbnailQueue } from "./thumbnailQueue.js";

interface BackfillResponse {
  complete?: boolean;
  jobId?: string | null;
  queuedIds?: string[];
}

const BATCH_SIZE = 2;
const POLL_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 10_000;
const MAX_ITERATIONS = 200;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backfillUrl(): string | null {
  const callbackUrl = config.thumbnails.completionWebhookUrl;
  if (!callbackUrl) {
    return null;
  }

  const url = new URL(callbackUrl);
  if (!url.pathname.endsWith("/complete-recording-thumbnails")) {
    return null;
  }

  url.pathname = url.pathname.replace(
    /\/complete-recording-thumbnails$/,
    "/enqueue-recording-thumbnail-backfill",
  );
  return url.toString();
}

async function waitForJob(jobId: string): Promise<void> {
  while (true) {
    const job = thumbnailQueue.get(jobId);
    if (job?.status === "completed" || job?.status === "failed") {
      logger.info("Protected thumbnail backfill batch finished", {
        jobId,
        status: job.status,
        successCount: job.result?.successes.length ?? 0,
        failureCount: job.result?.failures.length ?? 0,
      });
      return;
    }

    await wait(POLL_INTERVAL_MS);
  }
}

/** One-time rollout helper. Removed after the protected backfill reports complete. */
export async function drainProtectedThumbnailBackfill(): Promise<void> {
  const url = backfillUrl();
  if (!url) {
    logger.warn("Protected thumbnail backfill was skipped because its URL could not be derived.");
    return;
  }

  logger.info("Protected thumbnail backfill controller started", { batchSize: BATCH_SIZE });

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": config.http.sharedSecret,
        },
        body: JSON.stringify({ batchSize: BATCH_SIZE }),
      });
      const result = (await response.json()) as BackfillResponse;

      if (!response.ok) {
        throw new Error(`Backfill endpoint returned HTTP ${response.status}.`);
      }

      logger.info("Protected thumbnail backfill batch requested", {
        iteration,
        queuedCount: result.queuedIds?.length ?? 0,
        complete: result.complete === true,
        jobId: result.jobId ?? null,
      });

      if (result.complete === true) {
        logger.info("Protected thumbnail backfill completed", { iteration });
        return;
      }

      if (result.jobId) {
        await waitForJob(result.jobId);
        await wait(2_000);
      } else {
        await wait(IDLE_INTERVAL_MS);
      }
    } catch (error) {
      logger.warn("Protected thumbnail backfill controller retrying", {
        iteration,
        error: error instanceof Error ? error.message : String(error),
      });
      await wait(IDLE_INTERVAL_MS);
    }
  }

  logger.error("Protected thumbnail backfill controller reached its iteration limit.", {
    maxIterations: MAX_ITERATIONS,
  });
}
