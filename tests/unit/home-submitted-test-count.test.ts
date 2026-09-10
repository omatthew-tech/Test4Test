import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => ({ rpc }) }));
import { loadHomeSubmittedTestCount } from "../../src/lib/homeSubmittedTestCount";

describe("homepage submitted-test count", () => {
  beforeEach(() => {
    rpc.mockReset().mockReturnValue({ abortSignal });
    abortSignal.mockReset();
  });

  it("requests only the public aggregate and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    abortSignal.mockResolvedValue({ data: 72, error: null });
    expect(await loadHomeSubmittedTestCount(signal)).toBe(72);
    expect(rpc).toHaveBeenCalledWith("get_home_submitted_test_count", undefined, { get: true });
    expect(abortSignal).toHaveBeenCalledWith(signal);
  });

  it.each([0, "0", "1234"])("accepts the valid count %s", async (data) => {
    abortSignal.mockResolvedValue({ data, error: null });
    expect(await loadHomeSubmittedTestCount(new AbortController().signal)).toBe(Number(data));
  });

  it.each([null, "", "invalid", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid count %s instead of presenting an invented total",
    async (data) => {
      abortSignal.mockResolvedValue({ data, error: null });
      await expect(loadHomeSubmittedTestCount(new AbortController().signal)).rejects.toThrow(
        "Invalid homepage submitted-test count",
      );
    },
  );

  it("propagates API failures for the caption fallback", async () => {
    abortSignal.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    await expect(loadHomeSubmittedTestCount(new AbortController().signal)).rejects.toThrow(
      "Unavailable",
    );
  });
});
