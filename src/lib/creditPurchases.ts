import {
  checkoutUrl,
  UUID_PATTERN,
} from "../../supabase/functions/_shared/stripe-credit-purchases";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export { CREDIT_PACKS } from "../../supabase/functions/_shared/stripe-credit-purchases";

export function creditCheckoutEnabled() {
  return (
    import.meta.env.VITE_STRIPE_CHECKOUT_ENABLED === "true" &&
    import.meta.env.VITE_DS_FIXTURES !== "1"
  );
}

export async function createCreditCheckout(packId: string, requestId: string) {
  const {
    data: { session },
  } = await requireSupabase().auth.getSession();
  if (!session?.access_token) throw new Error("Sign in before buying credits.");
  const response = await fetch(`${supabaseUrl}/functions/v1/create-credit-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({ packId, requestId }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string" ? data.error : "Checkout is unavailable. Please try again.",
    );
  return checkoutUrl(data?.url);
}

export interface CreditPurchaseStatus {
  status: "pending" | "paid" | "failed" | "expired";
  credits: number;
  credits_granted: boolean;
  review_required: boolean;
}

export async function getCreditPurchase(orderId: string): Promise<CreditPurchaseStatus> {
  if (!UUID_PATTERN.test(orderId)) throw new Error("Invalid purchase reference.");
  const { data, error } = await requireSupabase()
    .from("credit_purchase_orders")
    .select("status,credits,credits_granted,review_required")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data)
    throw new Error(
      "We couldn't find this purchase. Sign in with the account used at checkout and try again.",
    );
  return data as CreditPurchaseStatus;
}
