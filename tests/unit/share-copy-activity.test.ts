import { afterEach, beforeEach, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { rpc: backend.rpc, auth: { getSession: backend.getSession } },
}));
import { recordShareLinkCopyClick } from "../../src/lib/shareCopyActivity";
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  backend.getSession.mockResolvedValue({ data: { session: { user: { id: "owner" } } } });
  backend.rpc.mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());
it("records the submission and retries transient failures", async () => {
  backend.rpc
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce({ error: { code: "503" } });
  const result = recordShareLinkCopyClick("app", "owner");
  await vi.runAllTimersAsync();
  await result;
  expect(backend.rpc).toHaveBeenCalledTimes(3);
  expect(backend.rpc).toHaveBeenLastCalledWith("record_share_link_copy_click", {
    p_submission_id: "app",
  });
});
it("does not retry denied ownership or transmit after the account changes", async () => {
  backend.rpc.mockResolvedValue({ error: { code: "42501" } });
  await recordShareLinkCopyClick("app", "owner");
  expect(backend.rpc).toHaveBeenCalledTimes(1);
  backend.getSession.mockResolvedValue({ data: { session: { user: { id: "other" } } } });
  await recordShareLinkCopyClick("app", "owner");
  expect(backend.rpc).toHaveBeenCalledTimes(1);
});
