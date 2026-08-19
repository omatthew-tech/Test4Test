import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { processRecordingThumbnails } from "./thumbnailProcessor.js";
import type { ProcessRecordingThumbnailsInput, RecordingThumbnailJob } from "./types.js";

export class RecordingThumbnailQueue {
  private readonly jobs = new Map<string, RecordingThumbnailJob>();
  private readonly inputs = new Map<string, ProcessRecordingThumbnailsInput>();
  private readonly pending: string[] = [];
  private readonly inFlightByFingerprint = new Map<string, string>();
  private active = 0;

  constructor(
    private readonly concurrency = Math.max(1, config.thumbnails.queueConcurrency),
    private readonly maxPending = Math.max(1, config.thumbnails.queueMaxPending),
    private readonly processor = processRecordingThumbnails,
  ) {}

  private fingerprint(input: ProcessRecordingThumbnailsInput) {
    return input.sources
      .map((source) => `${source.recordingUploadId}:${source.generationVersion}`)
      .sort()
      .join("|");
  }

  enqueue(input: ProcessRecordingThumbnailsInput) {
    const fingerprint = this.fingerprint(input);
    const existingId = this.inFlightByFingerprint.get(fingerprint);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) {
        return existing;
      }
    }

    if (this.pending.length + this.active >= this.maxPending) {
      throw new Error("Recording thumbnail queue is full. Retry shortly.");
    }

    const job: RecordingThumbnailJob = {
      id: randomUUID(),
      status: "queued",
      createdAt: new Date().toISOString(),
      sourceCount: input.sources.length,
    };
    this.jobs.set(job.id, job);
    this.inputs.set(job.id, input);
    this.pending.push(job.id);
    this.inFlightByFingerprint.set(fingerprint, job.id);
    queueMicrotask(() => this.drain());
    return job;
  }

  get(jobId: string) {
    return this.jobs.get(jobId);
  }

  private drain() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (jobId) {
        void this.run(jobId);
      }
    }
  }

  private async run(jobId: string) {
    const job = this.jobs.get(jobId);
    const input = this.inputs.get(jobId);
    if (!job || !input) {
      return;
    }

    const fingerprint = this.fingerprint(input);
    this.active += 1;
    job.status = "processing";
    job.startedAt = new Date().toISOString();
    logger.info("Recording thumbnail job started", { jobId, sourceCount: input.sources.length });

    try {
      const result = await this.processor(input);
      job.status =
        result.successes.length > 0 || result.failures.length > 0 ? "completed" : "failed";
      job.result = result;
      job.finishedAt = new Date().toISOString();
      await this.notifyCompletion(jobId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      job.status = "failed";
      job.error = message;
      job.finishedAt = new Date().toISOString();
      const failures = input.sources.map((source) => ({
        recordingUploadId: source.recordingUploadId,
        recordingObjectKey: source.objectKey,
        error: message,
      }));
      job.result = { successes: [], failures };
      await this.notifyCompletion(jobId, job.result);
    } finally {
      this.inputs.delete(jobId);
      this.inFlightByFingerprint.delete(fingerprint);
      this.active -= 1;
      this.drain();
    }
  }

  private async notifyCompletion(
    jobId: string,
    result: NonNullable<RecordingThumbnailJob["result"]>,
  ) {
    if (!config.thumbnails.completionWebhookUrl) {
      return;
    }

    try {
      const response = await fetch(config.thumbnails.completionWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.http.sharedSecret ? { "x-worker-secret": config.http.sharedSecret } : {}),
        },
        body: JSON.stringify({ jobId, ...result }),
      });
      if (!response.ok) {
        throw new Error(`Thumbnail callback returned HTTP ${response.status}.`);
      }
    } catch (error) {
      logger.warn("Recording thumbnail completion callback failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const thumbnailQueue = new RecordingThumbnailQueue();
