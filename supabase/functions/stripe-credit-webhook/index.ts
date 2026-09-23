import {
  paidSessionEvent,
  stripeObjectId,
  UUID_PATTERN,
} from "../_shared/stripe-credit-purchases.ts";
import { paymentEnvironment, paymentJson, Stripe } from "../_shared/stripe-runtime.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return paymentJson({ error: "Method not allowed." }, 405);
  let env;
  try {
    env = paymentEnvironment();
  } catch {
    return paymentJson({ error: "Webhook setup incomplete." }, 503);
  }
  const signingSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signingSecret) return paymentJson({ error: "Webhook setup incomplete." }, 503);
  let event: Stripe.Event;
  try {
    event = await env.stripe.webhooks.constructEventAsync(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      signingSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return paymentJson({ error: "Invalid webhook signature." }, 400);
  }
  if (event.livemode !== env.livemode || event.account)
    return paymentJson({ error: "Unexpected Stripe event context." }, 400);
  try {
    let update: Record<string, unknown> | null = null;
    if (
      ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(
        event.type,
      )
    ) {
      // Retrieve current state: event snapshots can arrive late or out of order.
      const session = await env.stripe.checkout.sessions.retrieve(
        (event.data.object as Stripe.Checkout.Session).id,
      );
      update = paidSessionEvent(session, env.livemode);
    } else if (
      ["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.purpose === "feedback_credits")
        update = {
          p_order_id: session.metadata.order_id,
          p_session_id: session.id,
          p_action: event.type === "checkout.session.expired" ? "expired" : "failed",
        };
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.metadata?.purpose === "feedback_credits")
        update = {
          p_order_id: invoice.metadata.order_id,
          p_invoice_id: invoice.id,
          p_action: "invoice",
        };
    } else if (event.type === "charge.refunded" || event.type.startsWith("charge.dispute.")) {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute;
      const chargeId = object.object === "charge" ? object.id : stripeObjectId(object.charge);
      if (chargeId) {
        const charge = await env.stripe.charges.retrieve(chargeId);
        const intentId = stripeObjectId(charge.payment_intent);
        if (intentId) {
          const intent = await env.stripe.paymentIntents.retrieve(intentId);
          if (intent.metadata.purpose === "feedback_credits")
            update = {
              p_order_id: intent.metadata.order_id,
              p_payment_intent_id: intentId,
              p_action: "review",
            };
        }
      }
    }
    if (update) {
      if (typeof update.p_order_id !== "string" || !UUID_PATTERN.test(update.p_order_id))
        throw new Error("Invalid order metadata.");
      const { data, error } = await env.admin.rpc("apply_credit_purchase_event", {
        ...update,
        p_event_id: event.id,
        p_event_type: event.type,
        p_livemode: env.livemode,
      });
      if (error) throw error;
      // Unknown IDs are retried; this also surfaces configuration/database mistakes.
      if (data === "unknown_order") throw new Error("Unknown purchase.");
    }
    return paymentJson({ received: true });
  } catch {
    console.error("Stripe credit event processing failed", {
      eventId: event.id,
      eventType: event.type,
    });
    return paymentJson({ error: "Event processing failed; retry required." }, 500);
  }
});
