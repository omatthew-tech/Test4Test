import type { ClipJob } from "./clipProcessor.js";

export type ClipNotifier = (
  job: ClipJob,
  event: "heartbeat" | "completed" | "failed",
) => Promise<boolean>;

/** Durable ownership lives in Postgres. Local work is bounded and attempt IDs fence late results. */
export class ClipQueue {
  private readonly jobs = new Set<string>();
  private readonly pending: ClipJob[] = [];
  private active = 0;
  constructor(
    private readonly process: (job: ClipJob) => Promise<void>,
    private readonly notify: ClipNotifier,
    private readonly discard: (job: ClipJob) => Promise<void>,
    private readonly options = { concurrency: 1, maxPending: 4, heartbeatMs: 60_000 },
    private readonly pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  get size() {
    return this.jobs.size;
  }
  enqueue(job: ClipJob) {
    if (this.jobs.has(job.attemptId)) return;
    if (this.jobs.size >= this.options.maxPending) throw new Error("Clip queue is full.");
    this.jobs.add(job.attemptId);
    this.pending.push(job);
    this.drain();
  }
  private drain() {
    while (this.active < this.options.concurrency && this.pending.length) {
      const job = this.pending.shift();
      if (job) {
        this.active++;
        void this.run(job);
      }
    }
  }
  private async run(job: ClipJob) {
    let timer: ReturnType<typeof setInterval> | undefined;
    let live = true;
    try {
      if (!(await this.notify(job, "heartbeat"))) return;
      timer = setInterval(() => {
        void this.notify(job, "heartbeat")
          .then((accepted) => {
            if (!accepted) live = false;
          })
          .catch(() => {});
      }, this.options.heartbeatMs);
      timer.unref();
      let event: "completed" | "failed" = "completed";
      try {
        await this.process(job);
      } catch {
        event = "failed";
      }
      if (!live) {
        await this.discard(job);
        return;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const accepted = await this.notify(job, event);
          if (!accepted || event === "failed") await this.discard(job);
          break;
        } catch {
          if (attempt < 2) await this.pause(attempt === 0 ? 1000 : 5000);
        }
      }
      // Unacknowledged assets are in the durable deletion ledger, and expired jobs retry.
    } catch {
      /* Never log source URLs, tokens, or ffmpeg provider output. */
    } finally {
      if (timer) clearInterval(timer);
      this.jobs.delete(job.attemptId);
      this.active--;
      this.drain();
    }
  }
}

export function createClipNotifier(url: string, secret: string): ClipNotifier {
  return async (job, event) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ clipId: job.clipId, attemptId: job.attemptId, event }),
    });
    if (!response.ok) throw new Error("Clip callback unavailable.");
    return ((await response.json()) as { accepted?: boolean }).accepted === true;
  };
}
