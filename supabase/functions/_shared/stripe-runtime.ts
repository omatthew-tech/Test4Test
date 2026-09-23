import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.100.1";

export function paymentEnvironment() {
  const mode = Deno.env.get("STRIPE_MODE") ?? "test";
  const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey =
    Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const baseUrl = new URL(Deno.env.get("APP_BASE_URL") || "http://localhost:5173");
  const local = (hostname: string) => ["localhost", "127.0.0.1", "kong"].includes(hostname);
  if (
    !["test", "live"].includes(mode) ||
    !new RegExp(`^(sk|rk)_${mode}_`).test(secret) ||
    !supabaseUrl ||
    !adminKey
  ) {
    throw new Error("Stripe environment is not configured.");
  }
  if (
    mode === "test" &&
    !local(new URL(supabaseUrl).hostname) &&
    Deno.env.get("STRIPE_TEST_DATABASE_CONFIRMED") !== "true"
  ) {
    throw new Error("Use a separate test database for sandbox payments.");
  }
  if (baseUrl.protocol !== "https:" && !(mode === "test" && local(baseUrl.hostname))) {
    throw new Error("Invalid application URL.");
  }
  const stripe = new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20000,
  });
  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { stripe, admin, livemode: mode === "live", origin: baseUrl.origin };
}

export function paymentJson(body: unknown, status = 200, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(origin
        ? {
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin",
            "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          }
        : {}),
    },
  });
}

export { Stripe };
