import { beforeEach, expect, it, vi } from "vitest";
import { loadEarnVisibilitySummary } from "../../src/lib/earnVisibility";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => ({ rpc }) }));

beforeEach(() => rpc.mockReset());

it("maps the server's current and projected ranks independently", async () => {
  rpc.mockResolvedValue({
    data: [{ submission_id: "app", rank: 8, rank_after_one_credit: 3, has_completed_test: false }],
    error: null,
  });
  expect(await loadEarnVisibilitySummary()).toMatchObject({
    submissionId: "app",
    rank: 8,
    rankAfterOneCredit: 3,
    hasCompletedTest: false,
  });
  expect(rpc).toHaveBeenCalledWith("get_my_earn_visibility_summary");
});

it.each([null, undefined, 0, -1])(
  "does not invent a missing or invalid projected rank (%s)",
  async (projection) => {
    rpc.mockResolvedValue({ data: [{ rank: 8, rank_after_one_credit: projection }], error: null });
    expect(await loadEarnVisibilitySummary()).toMatchObject({ rank: 8, rankAfterOneCredit: null });
  },
);

it("leaves an absent summary without a rank projection", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await loadEarnVisibilitySummary()).toMatchObject({ rank: null, rankAfterOneCredit: null });
});
