// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const handlerPath = "../../supabase/functions/_shared/background-scheduler.ts";
const workerPath = "../../services/background-scheduler/src/index.ts";
const { schedulerRequest } = await import(handlerPath);
const { runSchedule, default: worker } = await import(workerPath);
afterEach(() => vi.restoreAllMocks());
const secret = "test-only-scheduler-secret";
const env = { SUPABASE_URL: "https://example.test", BACKGROUND_SCHEDULER_SECRET: secret };
const request = (action = "recover", token = secret) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "x-background-scheduler-secret": token },
    body: JSON.stringify({ action }),
  });

it("rejects missing/wrong secrets and unsupported actions before accessing the database", async () => {
  const run = vi.fn();
  for (const token of ["", "wrong"]) {
    expect((await schedulerRequest(request("recover", token), { secret, run })).status).toBe(401);
  }
  expect((await schedulerRequest(request("delete"), { secret, run })).status).toBe(400);
  expect((await schedulerRequest(request(), { secret: "", run })).status).toBe(401);
  expect(
    (await schedulerRequest(new Request("https://example.test"), { secret, run })).status,
  ).toBe(405);
  expect(run).not.toHaveBeenCalled();
});
it("authenticates maintenance/recovery and does not expose database errors", async () => {
  const run = vi.fn().mockResolvedValue({ chat: false });
  const result = await schedulerRequest(request(), { secret, run });
  expect(await result.json()).toEqual({ ok: true, result: { chat: false } });
  expect(run).toHaveBeenCalledWith("recover");
  run.mockRejectedValue(new Error("private customer record and credential"));
  const failed = await schedulerRequest(request("maintain"), { secret, run });
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private");
});
it("uses the hourly trigger only for maintenance and authenticates both requests", async () => {
  const send = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  await runSchedule("2-59/5 * * * *", env, send);
  await runSchedule("19 * * * *", env, send);
  expect(send.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
    { action: "recover" },
    { action: "maintain" },
  ]);
  expect(send.mock.calls[0][1].headers["x-background-scheduler-secret"]).toBe(secret);
  expect(send.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it("backs off until the next tick instead of retrying an unhealthy backend", async () => {
  const send = vi.fn().mockResolvedValue(new Response("private provider details", { status: 503 }));
  await expect(runSchedule("2-59/5 * * * *", env, send)).rejects.toThrow("failed (503)");
  expect(send).toHaveBeenCalledTimes(1);
  await expect(
    runSchedule("2-59/5 * * * *", { ...env, BACKGROUND_SCHEDULER_SECRET: "" }, send),
  ).rejects.toThrow("secret missing");
  expect(send).toHaveBeenCalledTimes(1);
});
it("requires a successful acknowledgement and exposes no public dispatch route", async () => {
  const send = vi.fn().mockResolvedValue(Response.json({ ok: false }));
  await expect(runSchedule("2-59/5 * * * *", env, send)).rejects.toThrow("not acknowledged");
  expect(await worker.fetch().text()).toBe("Background scheduler is running");
});
