import assert from "node:assert/strict";
import { createCreditCheckout } from "./handler.ts";

Deno.test("Checkout uses the singular purchase RPC contract and server-owned prices", async () => {
  const settings: Record<string, string> = {
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_contract_fixture",
    STRIPE_PAYMENTS_ENABLED: "true",
    STRIPE_CREDIT_TAX_CODE: "txcd_20030000",
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: "local-contract-fixture",
    APP_BASE_URL: "http://localhost:5173",
  };
  const previous = new Map(Object.keys(settings).map((key) => [key, Deno.env.get(key)]));
  const originalFetch = globalThis.fetch;
  const orderId = "84000000-0000-4000-8000-000000000021";
  const userId = "83000000-0000-4000-8000-000000000021";
  const order = {
    id: orderId,
    user_id: userId,
    pack_id: "credits_3",
    credits: 3,
    amount_subtotal: 1399,
    currency: "usd",
    status: "pending",
    created_at: new Date().toISOString(),
    stripe_session_id: null as string | null,
  };
  const session = {
    id: "cs_test_contract",
    object: "checkout.session",
    livemode: false,
    status: "open",
    url: "https://checkout.stripe.com/c/pay/cs_test_contract",
  };
  const requests: Request[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  try {
    for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      const url = new URL(request.url);
      if (url.pathname === "/auth/v1/user") {
        return json({ id: userId, email: "stripe-fixture@example.com", is_anonymous: false });
      }
      if (url.pathname === "/rest/v1/rpc/begin_credit_purchase") {
        // PostgREST returns a table-valued RPC as an array unless singular JSON is requested.
        return json(
          request.headers.get("accept") === "application/vnd.pgrst.object+json" ? order : [order],
        );
      }
      if (url.pathname === "/v1/checkout/sessions" || url.pathname.endsWith(session.id)) {
        return json(session);
      }
      if (url.pathname === "/rest/v1/credit_purchase_orders" && request.method === "PATCH") {
        order.stripe_session_id = session.id;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected contract request: ${url.pathname}`);
    };
    const request = () =>
      new Request("http://localhost:54321/functions/v1/create-credit-checkout", {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture-user-token",
          Origin: settings.APP_BASE_URL,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: orderId,
          packId: "credits_3",
          amount: 1,
          userId: "forged",
        }),
      });
    const response = await createCreditCheckout(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: session.url, orderId });
    const rpc = requests.find((item) => item.url.endsWith("/rpc/begin_credit_purchase"))!;
    assert.deepEqual(await rpc.json(), {
      p_id: orderId,
      p_user_id: userId,
      p_pack_id: "credits_3",
      p_livemode: false,
    });
    const stripeRequest = requests.find((item) => item.url.endsWith("/v1/checkout/sessions"))!;
    const body = new URLSearchParams(await stripeRequest.text());
    assert.equal(body.get("line_items[0][price_data][unit_amount]"), "1399");
    assert.equal(body.get("automatic_tax[enabled]"), "true");
    assert.equal(body.get("invoice_creation[enabled]"), "true");
    assert.equal(body.get("success_url"), `http://localhost:5173/buy-credits?purchase=${orderId}`);
    assert.equal(stripeRequest.headers.get("idempotency-key"), `credit-purchase:${orderId}`);
    assert.equal((await createCreditCheckout(request())).status, 200);
    assert.equal(
      requests.filter((item) => new URL(item.url).pathname === "/v1/checkout/sessions").length,
      1,
    );
    assert.equal(
      requests.filter((item) => item.url.endsWith(`/v1/checkout/sessions/${session.id}`)).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
