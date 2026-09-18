import { readStarRating, isStarRating } from "./starRatings";
import type { StarRating, PaymentMethods } from "../types";
import { requireSupabase } from "./supabase";

export interface RecordingContact extends PaymentMethods {
  email: string;
}

export async function loadRecordingRating(responseId: string, userId: string) {
  const { data, error } = await requireSupabase()
    .from("feedback_ratings")
    .select("star_rating")
    .eq("test_response_id", responseId)
    .eq("rated_by_user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Your rating could not be loaded. Try again.");
  return data ? readStarRating(data.star_rating) : null;
}

export async function saveRecordingRating(
  responseId: string,
  userId: string,
  value: StarRating | null,
) {
  if (value !== null && !isStarRating(value)) {
    throw new Error("Choose a rating from 1 to 5 stars.");
  }
  const client = requireSupabase();
  const result =
    value === null
      ? await client
          .from("feedback_ratings")
          .delete()
          .eq("test_response_id", responseId)
          .eq("rated_by_user_id", userId)
          .select("id")
      : await client
          .from("feedback_ratings")
          .upsert(
            {
              test_response_id: responseId,
              rated_by_user_id: userId,
              star_rating: value,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "test_response_id,rated_by_user_id" },
          )
          .select("id");
  if (result.error || !result.data?.length) {
    throw new Error(
      value === null
        ? "Your rating could not be cleared. Try again."
        : "Your rating could not be saved. Try again.",
    );
  }
}

export async function loadRecordingContact(testerUserId: string): Promise<RecordingContact | null> {
  const { data, error } = await requireSupabase()
    .from("profiles")
    .select("email, paypal_handle, venmo_handle, cash_app_handle")
    .eq("id", testerUserId)
    .maybeSingle();
  if (error) throw new Error("Tester contact details could not be loaded. Try again.");
  return data
    ? {
        email: data.email,
        paypalHandle: data.paypal_handle,
        venmoHandle: data.venmo_handle,
        cashAppHandle: data.cash_app_handle,
      }
    : null;
}

export function recordingPaymentLinks(methods: PaymentMethods) {
  const services = [
    {
      label: "PayPal",
      value: methods.paypalHandle,
      base: "https://paypal.me/",
      hosts: ["paypal.me", "paypal.com", "www.paypal.com"],
    },
    {
      label: "Venmo",
      value: methods.venmoHandle,
      base: "https://venmo.com/",
      hosts: ["venmo.com", "www.venmo.com", "account.venmo.com"],
    },
    {
      label: "Cash App",
      value: methods.cashAppHandle,
      base: "https://cash.app/$",
      hosts: ["cash.app"],
    },
  ];
  return services.flatMap(({ label, value, base, hosts }) => {
    const raw = value?.trim();
    if (!raw) return [];
    const address = /^https?:\/\//i.test(raw) ? raw : raw.includes("/") ? `https://${raw}` : null;
    if (address) {
      try {
        const url = new URL(address);
        return url.protocol === "https:" &&
          hosts.includes(url.hostname) &&
          !url.username &&
          !url.password
          ? [{ label, url: url.href }]
          : [];
      } catch {
        return [];
      }
    }
    const handle = raw.replace(/^[@$]/, "");
    return /^[a-zA-Z0-9_.-]+$/.test(handle)
      ? [{ label, url: `${base}${encodeURIComponent(handle)}` }]
      : [];
  });
}

export async function requestTipPaymentMethods(responseId: string) {
  const { data, error } = await requireSupabase().functions.invoke(
    "send-tip-payment-method-request",
    {
      body: { responseId },
    },
  );
  if (error || !data?.ok) throw new Error("The request could not be sent. Try again.");
  return String(data.message ?? "The tester has been asked to add a payment method.");
}
