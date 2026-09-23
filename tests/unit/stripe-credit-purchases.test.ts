// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkoutUrl,
  paidSessionEvent,
  parsePurchaseRequest,
  type PaidSession,
} from "../../supabase/functions/_shared/stripe-credit-purchases";

const orderId = "83000000-0000-4000-8000-000000000001";
const session: PaidSession = {
  id: "cs_test_123",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  client_reference_id: orderId,
  metadata: { purpose: "feedback_credits", order_id: orderId, pack_id: "credits_3" },
  currency: "usd",
  amount_subtotal: 1399,
  amount_total: 1500,
  livemode: false,
  payment_intent: "pi_123",
  invoice: "in_123",
};

describe("credit checkout boundaries", () => {
  it("prices new single credits at $4.99 and accepts previously opened $5 checkouts", () => {
    expect(parsePurchaseRequest({ requestId: orderId, packId: "credits_1" }).pack).toMatchObject({
      amount: 499,
      price: "$4.99",
    });
    for (const amount of [499, 500]) {
      expect(
        paidSessionEvent(
          {
            ...session,
            metadata: { ...session.metadata, pack_id: "credits_1" },
            amount_subtotal: amount,
            amount_total: amount,
          },
          false,
        ),
      ).toMatchObject({ p_subtotal: amount, p_total: amount });
    }
  });
  it("ignores client pricing and only allows known packs and UUID request IDs", () => {
    expect(
      parsePurchaseRequest({ requestId: orderId, packId: "credits_3", amount: 1 }).pack.amount,
    ).toBe(1399);
    expect(() => parsePurchaseRequest({ requestId: orderId, packId: "credits_1000" })).toThrow();
    expect(() => parsePurchaseRequest({ requestId: "bad", packId: "credits_1" })).toThrow();
  });
  it("allows only Stripe-hosted HTTPS checkout redirects", () => {
    expect(checkoutUrl("https://checkout.stripe.com/c/pay/cs_test_123")).toContain(
      "checkout.stripe.com",
    );
    for (const url of [
      "https://checkout.stripe.com.attacker.test",
      "http://checkout.stripe.com",
      "javascript:alert(1)",
      "https://user@checkout.stripe.com",
    ])
      expect(() => checkoutUrl(url)).toThrow();
  });
  it("does not award credits for unpaid, incomplete, or unrelated sessions", () => {
    expect(paidSessionEvent({ ...session, payment_status: "unpaid" }, false)).toBeNull();
    expect(paidSessionEvent({ ...session, status: "open" }, false)).toBeNull();
    expect(paidSessionEvent({ ...session, metadata: {} }, false)).toBeNull();
  });
  it("requires exact amount, currency, mode and purchase linkage", () => {
    for (const override of [
      { amount_subtotal: 1 },
      { amount_total: 1000 },
      { currency: "eur" },
      { livemode: true },
      { payment_intent: null },
      { client_reference_id: "different" },
    ]) {
      expect(() => paidSessionEvent({ ...session, ...override }, false)).toThrow();
    }
    expect(paidSessionEvent(session, false)).toMatchObject({
      p_order_id: orderId,
      p_action: "paid",
      p_subtotal: 1399,
      p_total: 1500,
    });
  });
});
