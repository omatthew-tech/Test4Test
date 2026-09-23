import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openReceivedFeedback } from "../../src/lib/feedbackAccess";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => ({ rpc }) }));
beforeEach(() => {
  vi.stubEnv("VITE_DS_FIXTURES", "0");
  rpc.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("opens only the requested response/version and returns the authoritative final balance", async () => {
  rpc.mockResolvedValue({ data: { status: "unlocked", balance: 0 }, error: null });
  expect(await openReceivedFeedback("response", "version")).toEqual({
    status: "unlocked",
    balance: 0,
  });
  expect(rpc).toHaveBeenCalledWith("open_received_feedback", {
    p_response_id: "response",
    p_version_id: "version",
  });
});
it("treats malformed recording identifiers as unavailable", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "22P02" } });
  expect(await openReceivedFeedback("response", "invalid")).toEqual({ status: "unavailable" });
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("distinguishes permission failures from sign-in and temporary failures", async () => {
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "42501", message: "You do not have permission to view this feedback." },
  });
  await expect(openReceivedFeedback("response")).rejects.toThrow("do not have permission");
  rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
  await expect(openReceivedFeedback("response")).rejects.toThrow("Sign in again");
  rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST003" } });
  await expect(openReceivedFeedback("response")).rejects.toThrow("could not be verified");
});
