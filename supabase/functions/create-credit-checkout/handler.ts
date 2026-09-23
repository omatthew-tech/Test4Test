import { checkoutUrl, parsePurchaseRequest } from "../_shared/stripe-credit-purchases.ts";
import { paymentEnvironment, paymentJson } from "../_shared/stripe-runtime.ts";

interface CreditPurchaseOrder {
  id: string;
  pack_id: string;
  credits: number;
  amount_subtotal: number;
  currency: string;
  status: string;
  created_at: string;
  stripe_session_id: string | null;
}

export async function createCreditCheckout(request: Request): Promise<Response> {
  const origin = Deno.env.get("APP_BASE_URL") || "http://localhost:5173";
  const json = (body: unknown, status = 200) => paymentJson(body, status, new URL(origin).origin);
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(origin).origin)
    return json({ error: "Origin not allowed." }, 403);
  if (Deno.env.get("STRIPE_PAYMENTS_ENABLED") !== "true")
    return json({ error: "Credit purchases aren't available yet." }, 503);
  try {
    const { stripe, admin, livemode, origin: appOrigin } = paymentEnvironment();
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in before buying credits." }, 401);
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user || user.is_anonymous)
      return json({ error: "Sign in before buying credits." }, 401);
    let purchase;
    try {
      purchase = parsePurchaseRequest(await request.json());
    } catch {
      return json({ error: "Choose a valid credit pack and purchase request." }, 400);
    }
    const taxCode = Deno.env.get("STRIPE_CREDIT_TAX_CODE");
    if (!taxCode || !/^txcd_\d+$/.test(taxCode))
      return json({ error: "Checkout setup is incomplete." }, 503);
    const { data: order, error } = await admin
      .rpc("begin_credit_purchase", {
        p_id: purchase.requestId,
        p_user_id: user.id,
        p_pack_id: purchase.pack.id,
        p_livemode: livemode,
      })
      .single<CreditPurchaseOrder>();
    if (error)
      return json(
        {
          error:
            error.code === "54000"
              ? "Too many checkout attempts. Try again later."
              : "Unable to start this purchase.",
        },
        error.code === "54000" ? 429 : 409,
      );
    if (order.status !== "pending" || Date.now() - Date.parse(order.created_at) > 23 * 3600000) {
      return json(
        { error: "This checkout has ended. Reload the page to start a new purchase." },
        409,
      );
    }
    const metadata = { purpose: "feedback_credits", order_id: order.id, pack_id: order.pack_id };
    const session = order.stripe_session_id
      ? await stripe.checkout.sessions.retrieve(order.stripe_session_id)
      : await stripe.checkout.sessions.create(
          {
            mode: "payment",
            client_reference_id: order.id,
            customer_creation: "always",
            ...(user.email ? { customer_email: user.email } : {}),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: order.currency,
                  unit_amount: order.amount_subtotal,
                  tax_behavior: "exclusive",
                  product_data: {
                    name: `${order.credits} Test4Test feedback ${order.credits === 1 ? "credit" : "credits"}`,
                    tax_code: taxCode,
                  },
                },
              },
            ],
            automatic_tax: { enabled: true },
            billing_address_collection: "required",
            tax_id_collection: { enabled: true },
            adaptive_pricing: { enabled: false },
            invoice_creation: { enabled: true, invoice_data: { metadata } },
            metadata,
            payment_intent_data: { metadata },
            success_url: `${appOrigin}/buy-credits?purchase=${order.id}`,
            cancel_url: `${appOrigin}/buy-credits?canceled=1`,
          },
          { idempotencyKey: `credit-purchase:${order.id}` },
        );
    if (session.livemode !== livemode || session.status !== "open")
      return json({ error: "This checkout has ended. Reload to try again." }, 409);
    const url = checkoutUrl(session.url);
    const { error: saveError } = await admin
      .from("credit_purchase_orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);
    if (saveError) throw saveError;
    return json({ url, orderId: order.id });
  } catch {
    // Never echo API keys, Stripe objects, customer details, or signed URLs.
    return json({ error: "Checkout is temporarily unavailable. Please try again." }, 503);
  }
}
