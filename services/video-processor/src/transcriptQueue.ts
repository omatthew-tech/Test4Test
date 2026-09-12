import type { ResponseTranscript } from "./types.js";

export interface TranscriptJobInput {
  responseId: string;
  versionId?: string;
  attemptId: string;
  source:
    | { bucket: string; objectKey: string; url?: never }
    | { url: string; bucket?: never; objectKey?: never };
}

type Event = "heartbeat" | "completed" | "failed";
export type TranscriptNotifier = (
  job: TranscriptJobInput,
  event: Event,
  result?: ResponseTranscript,
) => Promise<boolean>;

/** Postgres owns durable state; this queue only bounds local work and renews attempt leases. */
export class TranscriptQueue {
  private readonly jobs = new Map<
    string,
    { input: TranscriptJobInput; live: boolean; timer: ReturnType<typeof setInterval> }
  >();
  private readonly pending: string[] = [];
  private active = 0;

  constructor(
    private readonly processor: (input: TranscriptJobInput) => Promise<ResponseTranscript>,
    private readonly notify: TranscriptNotifier,
    private readonly options = { concurrency: 2, maxPending: 8, heartbeatMs: 60_000 },
    private readonly pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  enqueue(input: TranscriptJobInput) {
    if (this.jobs.has(input.attemptId)) return;
    if (this.jobs.size >= this.options.maxPending) throw new Error("Transcript queue is full.");
    const timer = setInterval(() => {
      void this.heartbeat(input.attemptId);
    }, this.options.heartbeatMs);
    timer.unref();
    this.jobs.set(input.attemptId, { input, live: true, timer });
    this.pending.push(input.attemptId);
    queueMicrotask(() => this.drain());
  }

  get size() {
    return this.jobs.size;
  }

  private async heartbeat(attemptId: string) {
    const job = this.jobs.get(attemptId);
    if (!job || !job.live) return;
    try {
      job.live = await this.notify(job.input, "heartbeat");
    } catch {
      /* A transient callback outage is recovered by the durable lease. */
    }
  }

  private drain() {
    while (this.active < this.options.concurrency && this.pending.length) {
      const id = this.pending.shift();
      if (id) void this.run(id);
    }
  }

  private async run(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.active++;
    try {
      // Require a valid lease before reading private media, including jobs that waited locally.
      job.live = await this.notify(job.input, "heartbeat");
      if (!job.live) return;
      let result: ResponseTranscript | undefined;
      let event: Event = "completed";
      try {
        result = await this.processor(job.input);
      } catch {
        event = "failed";
      }
      if (!job.live) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.notify(job.input, event, result);
          break;
        } catch {
          if (attempt < 2) await this.pause(attempt === 0 ? 1000 : 5000);
          // An unacknowledged result is retried by Postgres after lease expiry.
        }
      }
    } catch {
      // Never log provider exception messages, transcript text, or signed source URLs.
    } finally {
      clearInterval(job.timer);
      this.jobs.delete(id);
      this.active--;
      this.drain();
    }
  }
}

export function createTranscriptNotifier(url: string, secret: string): TranscriptNotifier {
  return async (job, event, result) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        responseId: job.responseId,
        ...(job.versionId ? { versionId: job.versionId } : {}),
        attemptId: job.attemptId,
        event,
        ...(result ? { result } : {}),
      }),
    });
    if (!response.ok) throw new Error("Transcript callback unavailable.");
    const payload = (await response.json()) as { accepted?: boolean };
    return payload.accepted === true;
  };
}
