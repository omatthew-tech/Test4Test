/** Serialize native media work across both queues, including failure cleanup. */
export class MediaExecutor {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Admission closes atomically before the host stops an idle process. */
export class MediaLifecycle {
  private draining = false;

  constructor(private readonly pendingJobs: () => number) {}

  get accepting() {
    return !this.draining;
  }

  prepareToSleep() {
    if (this.pendingJobs() !== 0) return false;
    this.draining = true;
    return true;
  }
}
