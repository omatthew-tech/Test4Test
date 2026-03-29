import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

interface NotificationResponse {
  error?: string;
  message?: string;
}

export async function notifySubmissionOwnerAboutNewResult(responseId: string) {
  if (!responseId || !supabaseUrl || !supabasePublishableKey) {
    return;
  }

  try {
    const supabase = requireSupabase();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/send-test-results-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabasePublishableKey,
      },
      body: JSON.stringify({ responseId }),
    });

    if (!response.ok) {
      let payload: NotificationResponse | null = null;

      try {
        payload = (await response.json()) as NotificationResponse;
      } catch {
        payload = null;
      }

      console.error(
        "Failed to send test results notification.",
        payload?.error ?? payload?.message ?? response.statusText,
      );
    }
  } catch (error) {
    console.error("Failed to send test results notification.", error);
  }
}