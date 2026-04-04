import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

interface ReportFeedbackResponse {
  error?: string;
  message?: string;
  ok?: boolean;
}

export async function reportFeedbackRating(responseId: string, message: string) {
  if (!responseId || !supabaseUrl || !supabasePublishableKey) {
    throw new Error("Reporting is not available in the current environment.");
  }

  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Sign in to report a rating.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/report-feedback-rating`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({
      responseId,
      message,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ReportFeedbackResponse | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "We could not send your report right now.");
  }

  return payload;
}