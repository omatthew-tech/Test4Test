import { EarnSubmissionReputation } from "../types";
import { requireSupabase } from "./supabase";

interface EarnSubmissionReputationRpcRow {
  submission_id: string;
  owner_has_tested_you: boolean;
  owner_test_back_rate_percent: number | null;
  owner_satisfaction_rate_percent: number | null;
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function loadEarnSubmissionReputations(submissionIds: string[]) {
  if (submissionIds.length === 0) {
    return [] as EarnSubmissionReputation[];
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_earn_submission_reputation", {
    p_submission_ids: submissionIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as EarnSubmissionReputationRpcRow[]).map((row) => ({
    submissionId: row.submission_id,
    ownerHasTestedYou: row.owner_has_tested_you === true,
    ownerTestBackRatePercent: normalizePercent(row.owner_test_back_rate_percent),
    ownerSatisfactionRatePercent: normalizePercent(
      row.owner_satisfaction_rate_percent,
    ),
    ownerAvatarUrl: null,
  }));
}
