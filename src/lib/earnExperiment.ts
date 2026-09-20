import { currentEarnVisit, type EarnEntrySource } from "./earnExperimentVisits";
import { requireSupabase } from "./supabase";

export type EarnExperimentVariant = "A" | "B";
export interface EarnExperimentTotals {
  variant: EarnExperimentVariant;
  assigned: number;
  exposed: number;
  unexposed: number;
  completed: number;
  notCompleted: number;
  completionPercent: number | null;
  medianSeconds: number | null;
}
export interface EarnExperimentReport {
  key: string;
  status: "draft" | "running" | "paused" | "ended";
  startedAt: string | null;
  endedAt: string | null;
  asOf: string;
  variants: EarnExperimentTotals[];
  sources: {
    variant: EarnExperimentVariant;
    stage: "exposure" | "completion";
    source: EarnEntrySource;
    users: number;
  }[];
}
const registeredVisits = new Set<string>();

export async function ensureEarnVisit(userId: string): Promise<string | null> {
  if (import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1") return null;
  const visit = currentEarnVisit(userId);
  const cacheKey = `${userId}:${visit.id}`;
  if (registeredVisits.has(cacheKey)) return visit.id;
  try {
    const { data, error } = await requireSupabase()
      .rpc("record_earn_visit", {
        p_visit_id: visit.id,
        p_source: visit.source,
        p_entry_route: visit.entryRoute,
      })
      .abortSignal(AbortSignal.timeout(2500));
    if (error || data !== visit.id) return null;
    registeredVisits.add(cacheKey);
    return visit.id;
  } catch {
    return null;
  }
}

export async function recordEarnExposure(
  userId: string,
  key: string,
  variant: EarnExperimentVariant,
) {
  const visitId = await ensureEarnVisit(userId);
  const { data, error } = await requireSupabase().rpc("record_earn_exposure", {
    p_experiment_key: key,
    p_variant: variant,
    p_visit_id: visitId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function manageEarnExperiment(
  action: "report" | "start" | "pause" | "end" = "report",
) {
  const { data, error } = await requireSupabase().rpc("manage_earn_experiment", {
    p_action: action,
  });
  if (error) throw new Error(error.message);
  return data as EarnExperimentReport;
}
