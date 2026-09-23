import { requireSupabase } from "./supabase";
import type { FeedbackAccess } from "../types";

export interface OpenFeedbackResult {
  status: Exclude<FeedbackAccess, "locked"> | "insufficient_credits" | "unavailable";
  balance?: number;
  testBackSubmissionId?: string | null;
  response?: Record<string, unknown>;
}

export async function openReceivedFeedback(
  responseId: string,
  versionId?: string,
): Promise<OpenFeedbackResult> {
  if (import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1") {
    const scenario = new URLSearchParams(window.location.search).get("ds-feedback");
    if (scenario === "error") throw new Error("Feedback access could not be verified. Try again.");
    if (scenario === "locked" || scenario === "no-target")
      return {
        status: "insufficient_credits",
        balance: 0,
        testBackSubmissionId: scenario === "locked" ? "submission-focusflow" : null,
      };
    return {
      status: scenario === "last-credit" ? "unlocked" : "free",
      balance: scenario === "last-credit" ? 0 : 1,
    };
  }
  const { data, error } = await requireSupabase().rpc("open_received_feedback", {
    p_response_id: responseId,
    p_version_id: versionId ?? null,
  });
  if (error?.code === "22P02") return { status: "unavailable" };
  if (error)
    throw new Error(
      error.code === "42501"
        ? error.message === "You do not have permission to view this feedback."
          ? error.message
          : "Sign in again to view this feedback."
        : "Feedback access could not be verified. Try again.",
    );
  if (!data || !["free", "unlocked", "insufficient_credits", "unavailable"].includes(data.status))
    throw new Error("Feedback access could not be verified. Try again.");
  return data as OpenFeedbackResult;
}
