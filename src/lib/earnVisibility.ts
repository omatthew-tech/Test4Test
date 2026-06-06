import { EarnVisibilitySummary } from "../types";
import { requireSupabase } from "./supabase";

interface EarnVisibilitySummaryRpcRow {
  submission_id: string | null;
  product_name: string | null;
  rank: number | null;
  ranked_submission_count: number | null;
  token_balance: number | null;
  test_back_rate_percent: number | null;
  satisfaction_rate_percent: number | null;
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCount(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeRank(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 1) {
    return null;
  }

  return Math.round(value);
}

export async function loadEarnVisibilitySummary() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_my_earn_visibility_summary");

  if (error) {
    throw new Error(error.message);
  }

  const row = ((data ?? []) as EarnVisibilitySummaryRpcRow[])[0];

  if (!row) {
    return {
      submissionId: null,
      productName: null,
      rank: null,
      rankedSubmissionCount: 0,
      testBackRatePercent: 100,
      satisfactionRatePercent: 100,
      tokenBalance: 0,
    } satisfies EarnVisibilitySummary;
  }

  return {
    submissionId: row.submission_id ?? null,
    productName: row.product_name ?? null,
    rank: normalizeRank(row.rank),
    rankedSubmissionCount: normalizeCount(row.ranked_submission_count),
    testBackRatePercent: normalizePercent(row.test_back_rate_percent),
    satisfactionRatePercent: normalizePercent(row.satisfaction_rate_percent),
    tokenBalance: normalizeCount(row.token_balance),
  } satisfies EarnVisibilitySummary;
}
