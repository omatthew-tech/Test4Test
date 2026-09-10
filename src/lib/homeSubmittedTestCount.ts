import { requireSupabase } from "./supabase";

export async function loadHomeSubmittedTestCount(signal: AbortSignal): Promise<number> {
  const { data, error } = await requireSupabase()
    .rpc("get_home_submitted_test_count", undefined, { get: true })
    .abortSignal(signal);

  if (error) throw new Error(error.message);

  // Postgres bigint may be returned as a JSON number or a decimal string.
  const count =
    typeof data === "number" || (typeof data === "string" && /^\d+$/.test(data))
      ? Number(data)
      : NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid homepage submitted-test count.");
  }
  return count;
}
