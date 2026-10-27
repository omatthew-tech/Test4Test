// Background jobs outlive their HTTP 202 response. A durable alarm checks the
// process's queues and callbacks before stopping it; HTTP inactivity is not idle.
export const IDLE_CHECK_MS = 60_000;
export const INACTIVITY_GRACE_MS = 6 * 60 * 60 * 1000;

type Runtime = Pick<
  Container,
  "running" | "start" | "setInactivityTimeout" | "getTcpPort" | "destroy" | "monitor"
>;

export class MediaContainerLifecycle {
  private readiness?: Promise<void>;

  constructor(
    private readonly container: Runtime,
    private readonly storage: Pick<DurableObjectStorage, "setAlarm">,
    private readonly options: ContainerStartupOptions,
    private readonly secret: string,
    private readonly observe: (exit: Promise<void>) => void,
    private readonly pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async restore() {
    if (!this.container.running) return;
    await this.container.setInactivityTimeout(INACTIVITY_GRACE_MS);
    await this.scheduleCheck();
    this.observe(this.container.monitor());
  }

  private scheduleCheck() {
    return this.storage.setAlarm(Date.now() + IDLE_CHECK_MS);
  }

  private async startAndWait() {
    // Persist the next idle check before allocating compute, including failed starts.
    await this.scheduleCheck();
    if (!this.container.running) {
      console.log("Starting media container.");
      this.container.start(this.options);
      this.observe(this.container.monitor());
    }
    // Alarms keep the object active while jobs are running. This grace protects
    // background work across eviction; restore() reapplies it after a deployment.
    await this.container.setInactivityTimeout(INACTIVITY_GRACE_MS);
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      if (!this.container.running) throw new Error("Media container stopped during startup.");
      try {
        const response = await this.container.getTcpPort(8787).fetch("http://container/healthz", {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.ok) return;
      } catch {
        // The VM can be running before Node has connected to R2 and opened its port.
      }
      await this.pause(500);
    }
    throw new Error("Media container is not ready yet.");
  }

  async fetch(request: Request) {
    if (!this.readiness) {
      this.readiness = this.startAndWait().finally(() => {
        this.readiness = undefined;
      });
    }
    await this.readiness;
    // The private Cloudflare port tunnel is already encrypted; its HTTP proxy
    // rejects HTTPS URLs even when the public request arrived over HTTPS.
    const target = new URL(request.url);
    target.protocol = "http:";
    return this.container.getTcpPort(8787).fetch(new Request(target, request));
  }

  async alarm() {
    if (!this.container.running) return;
    await this.scheduleCheck();
    if (this.readiness) return;
    try {
      const response = await this.container
        .getTcpPort(8787)
        .fetch("http://container/internal/prepare-sleep", {
          method: "POST",
          headers: { "x-worker-secret": this.secret },
          signal: AbortSignal.timeout(10_000),
        });
      // The process closes admission atomically before returning idle:true.
      // Requests racing this check get a retryable 503 instead of losing a job.
      if (response.ok && ((await response.json()) as { idle?: boolean }).idle === true) {
        if (this.container.running) {
          console.log("Stopping idle media container.");
          // PID 1 may ignore SIGTERM. Stop the VM only after the process has
          // explicitly drained and closed admission; never on probe failure.
          await this.container.destroy();
        }
      }
    } catch {
      // Keep live jobs on transient probe failures; the next alarm checks again.
    }
  }
}
