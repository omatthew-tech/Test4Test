// Pure payment validation shared by the Edge Function adapters and focused tests.
export const CREDIT_PACKS = [
  { id: "credits_1", credits: 1, amount: 499, price: "$4.99", bestValue: false },
  { id: "credits_3", credits: 3, amount: 1399, price: "$13.99", bestValue: false },
  { id: "credits_5", credits: 5, amount: 1999, price: "$19.99", bestValue: true },
] as const;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePurchaseRequest(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Choose a credit pack.");
  const request = value as Record<string, unknown>;
  if (typeof request.requestId !== "string" || !UUID_PATTERN.test(request.requestId)) {
    throw new Error("Invalid purchase request.");
  }
  const pack = CREDIT_PACKS.find((item) => item.id === request.packId);
  if (!pack) throw new Error("Choose a valid credit pack.");
  return { requestId: request.requestId, pack };
}

export function checkoutUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Checkout is not available.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid checkout destination.");
  }
  return value;
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string")
    return value.id;
  return null;
}

export interface PaidSession {
  id: string;
  mode: string | null;
  status: string | null;
  payment_status: string;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  currency: string | null;
  amount_subtotal: number | null;
  amount_total: number | null;
  livemode: boolean;
  payment_intent: unknown;
  invoice: unknown;
}

export function paidSessionEvent(session: PaidSession, livemode: boolean) {
  if (session.metadata?.purpose !== "feedback_credits") return null;
  if (session.livemode !== livemode) throw new Error("Stripe mode mismatch.");
  if (
    session.mode !== "payment" ||
    session.status !== "complete" ||
    session.payment_status !== "paid"
  )
    return null;
  const pack = CREDIT_PACKS.find((item) => item.id === session.metadata?.pack_id);
  // Previously opened $5 checkouts retain their order price, which the ledger also verifies.
  const legacySingleCredit = pack?.id === "credits_1" && session.amount_subtotal === 500;
  const orderId = session.client_reference_id;
  if (
    !pack ||
    !orderId ||
    !UUID_PATTERN.test(orderId) ||
    session.metadata.order_id !== orderId ||
    session.currency !== "usd" ||
    (session.amount_subtotal !== pack.amount && !legacySingleCredit) ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total! < pack.amount ||
    !stripeObjectId(session.payment_intent)
  )
    throw new Error("Payment does not match credit pack.");
  return {
    p_order_id: orderId,
    p_livemode: livemode,
    p_action: "paid",
    p_session_id: session.id,
    p_payment_intent_id: stripeObjectId(session.payment_intent),
    p_subtotal: session.amount_subtotal,
    p_total: session.amount_total,
    p_currency: session.currency,
    p_invoice_id: stripeObjectId(session.invoice),
  };
}
