import type { SupabaseClient } from "@supabase/supabase-js";

export type FeedbackAccess = "free" | "locked" | "unlocked";

/** Caller must authenticate the owner before using this service-role operation. */
export async function receivedFeedbackAccess(
  admin: SupabaseClient,
  ownerId: string,
  responseIds: string[],
): Promise<Map<string, FeedbackAccess>> {
  if (!responseIds.length) return new Map();
  const { data, error } = await admin.rpc("get_received_feedback_access", {
    p_owner: ownerId,
    p_response_ids: responseIds,
  });
  if (error || !Array.isArray(data)) throw new Error("Feedback access could not be verified.");
  const access = new Map<string, FeedbackAccess>();
  for (const row of data) {
    if (["free", "locked", "unlocked"].includes(row.access))
      access.set(row.response_id, row.access);
  }
  // Missing rows are denied, including responses which changed ownership during the request.
  for (const id of responseIds) if (!access.has(id)) access.set(id, "locked");
  return access;
}
