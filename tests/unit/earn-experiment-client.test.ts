import { beforeEach, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => backend }));

beforeEach(() => {
  vi.resetModules();
  backend.rpc.mockReset();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/earn?earn_entry=feedback_email");
});

it("records exposure as unknown when visit attribution fails, and retries the visit later", async () => {
  backend.rpc.mockImplementation((name) =>
    name === "record_earn_visit"
      ? { abortSignal: () => Promise.resolve({ data: null, error: { message: "Offline" } }) }
      : Promise.resolve({ data: true, error: null }),
  );
  const { recordEarnExposure, ensureEarnVisit } = await import("../../src/lib/earnExperiment");
  expect(await recordEarnExposure("owner", "earn_activation_v1", "B")).toBe(true);
  expect(backend.rpc).toHaveBeenCalledWith("record_earn_exposure", {
    p_experiment_key: "earn_activation_v1",
    p_variant: "B",
    p_visit_id: null,
  });
  backend.rpc.mockImplementation((_name, args) => ({
    abortSignal: () => Promise.resolve({ data: args.p_visit_id, error: null }),
  }));
  const registered = await ensureEarnVisit("owner");
  expect(registered).toEqual(expect.any(String));
  expect(await ensureEarnVisit("owner")).toBe(registered);
  expect(backend.rpc).toHaveBeenCalledTimes(3);
});

it("surfaces exposure failure for retry without changing the assigned variant", async () => {
  backend.rpc.mockImplementation((name, args) =>
    name === "record_earn_visit"
      ? { abortSignal: () => Promise.resolve({ data: args.p_visit_id, error: null }) }
      : Promise.resolve({ data: null, error: { message: "Unavailable" } }),
  );
  const { recordEarnExposure } = await import("../../src/lib/earnExperiment");
  await expect(recordEarnExposure("owner", "earn_activation_v1", "A")).rejects.toThrow(
    "Unavailable",
  );
  expect(backend.rpc).toHaveBeenLastCalledWith(
    "record_earn_exposure",
    expect.objectContaining({ p_variant: "A" }),
  );
});
