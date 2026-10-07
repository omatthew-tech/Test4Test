interface Environment {
  SUPABASE_URL: string;
  BACKGROUND_SCHEDULER_SECRET: string;
}

export async function runSchedule(cron: string, env: Environment, send: typeof fetch = fetch) {
  if (!env.BACKGROUND_SCHEDULER_SECRET) throw new Error("Scheduler secret missing");
  const action = cron === "19 * * * *" ? "maintain" : "recover";
  const response = await send(`${env.SUPABASE_URL}/functions/v1/recover-background-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-background-scheduler-secret": env.BACKGROUND_SCHEDULER_SECRET,
    },
    body: JSON.stringify({ action }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    // No immediate retry loop during a database outage. The next scheduled
    // invocation retries; durable queue rows are untouched by transport failure.
    throw new Error(`Background ${action} failed (${response.status})`);
  }
  const result = (await response.json()) as { ok?: boolean };
  if (result.ok !== true) throw new Error(`Background ${action} was not acknowledged`);
  console.log(JSON.stringify({ action, ok: true }));
}

export default {
  async scheduled(controller: { cron: string }, env: Environment) {
    await runSchedule(controller.cron, env);
  },
  fetch() {
    // Public liveness only. HTTP callers cannot execute jobs or access secrets.
    return new Response("Background scheduler is running", {
      headers: { "Cache-Control": "no-store" },
    });
  },
};
