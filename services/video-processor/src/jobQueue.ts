import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { processReport } from "./reportProcessor.js";
import type { Job, ProcessReportInput, ProcessReportResult } from "./types.js";

/**
 * Minimal in-process asynchronous job queue.
 *
 * Why async (background job) rather than synchronous?
 *  - Frame extraction is CPU/IO heavy and can take from seconds to minutes per
 *    recording, which exceeds sane HTTP request timeouts and ties up connections.
 *  - Clients should fire-and-poll: enqueue a job (HTTP 202), then poll status.
 *
 * This implementation keeps jobs in memory with bounded concurrency, which is
 * perfect for a single worker instance. For multiple instances / durability,
 * swap this class for a Redis-backed queue such as BullMQ (the public API —
 * `enqueue` / `get` — stays the same). See README for the migration note.
 */
class JobQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly pending: string[] = [];
  private active = 0;
  private readonly concurrency: number;

  constructor(concurrency = 1) {
    this.concurrency = Math.max(1, concurrency);
  }

  enqueue(input: ProcessReportInput): Job {
    const job: Job = {
      id: randomUUID(),
      reportId: input.reportId,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    this.inputs.set(job.id, input);

    logger.info("Job enqueued", { jobId: job.id, reportId: job.reportId });
    queueMicrotask(() => this.drain());

    return job;
  }

  get(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  private readonly inputs = new Map<string, ProcessReportInput>();

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (!jobId) {
        break;
      }
      void this.run(jobId);
    }
  }

  private async run(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    const input = this.inputs.get(jobId);

    if (!job || !input) {
      return;
    }

    this.active += 1;
    job.status = "processing";
    job.startedAt = new Date().toISOString();
    logger.info("Job started", { jobId, reportId: job.reportId });

    try {
      const result = await processReport(input);
      job.status = "completed";
      job.result = result;
      job.finishedAt = new Date().toISOString();
      logger.info("Job completed", { jobId, frameCount: result.frameCount });
      await notifyCompletion(result, undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      job.status = "failed";
      job.error = message;
      job.finishedAt = new Date().toISOString();
      logger.error("Job failed", { jobId, reportId: job.reportId, error: message });
      await notifyCompletion(undefined, { reportId: job.reportId, error: message });
    } finally {
      this.inputs.delete(jobId);
      this.active -= 1;
      this.drain();
    }
  }
}

/**
 * Optionally POST the outcome to a completion webhook (e.g. a Supabase Edge
 * Function that writes usability_report_frames rows and flips the report status).
 */
async function notifyCompletion(
  result: ProcessReportResult | undefined,
  failure: { reportId: string; error: string } | undefined,
): Promise<void> {
  if (!config.completionWebhookUrl) {
    return;
  }

  const payload = result
    ? { status: "completed" as const, ...result }
    : { status: "failed" as const, ...failure };

  try {
    await fetch(config.completionWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.http.sharedSecret ? { "x-worker-secret": config.http.sharedSecret } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.warn("Completion webhook failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const jobQueue = new JobQueue(Number(process.env.JOB_CONCURRENCY) || 1);
