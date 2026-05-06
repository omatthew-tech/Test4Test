import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

interface TipPaymentMethodRequestResponse {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  message?: string;
  error?: string;
}

export async function requestTipPaymentMethodEmail(responseId: string) {
  if (!responseId || !supabaseUrl || !supabasePublishableKey) {
    throw new Error("Tip notification is not available in the current environment.");
  }

  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Sign in again to send this tip notification.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-tip-payment-method-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({ responseId }),
  });
  const payload = (await response.json().catch(() => null)) as TipPaymentMethodRequestResponse | null;

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? "The tester could not be notified right now.");
  }

  return {
    ok: payload?.ok === true,
    skipped: payload?.skipped === true,
    reason: payload?.reason ?? "",
    message: payload?.message ?? "We emailed this tester a link to add a payment method.",
  };
}

export async function notifyTipPaymentMethodsAdded() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Tip notification is not available in the current environment.");
  }

  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Sign in again to send tip notifications.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-tip-payment-method-added`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({}),
  });
  const payload = (await response.json().catch(() => null)) as (TipPaymentMethodRequestResponse & {
    notifiedCount?: number;
  }) | null;

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? "Tip notifications could not be sent right now.");
  }

  return {
    ok: payload?.ok === true,
    skipped: payload?.skipped === true,
    reason: payload?.reason ?? "",
    notifiedCount: typeof payload?.notifiedCount === "number" ? payload.notifiedCount : 0,
    message: payload?.message ?? "Tip notifications sent.",
  };
}
