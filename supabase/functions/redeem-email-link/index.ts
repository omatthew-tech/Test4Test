import { createClient } from "npm:@supabase/supabase-js@2.100.1";
import { redeemEmailLink } from "../_shared/redeem-email-link.ts";

Deno.serve((request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const allowedOrigins = (
    Deno.env.get("EMAIL_ACCESS_ALLOWED_ORIGINS") ||
    Deno.env.get("APP_BASE_URL") ||
    "https://test4test.io"
  )
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  };
  // Fresh clients per request: verifyOtp must never replace the service client's authorization.
  return redeemEmailLink(request, {
    admin: createClient(url, secret, options),
    verifier: createClient(url, publicKey, options),
    allowedOrigins,
  });
});
