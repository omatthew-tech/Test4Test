import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestAccountLoginRequest {
  email?: string;
  passcode?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function normalizeEmail(email: string | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const enabled = env("TEST_ACCOUNT_ENABLED").toLowerCase();

  if (enabled !== "true" && enabled !== "1") {
    return json({ error: "Test account login is disabled." }, 404);
  }

  const supabaseUrl = env("SUPABASE_URL");
  const publishableKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  const testAccountEmail = normalizeEmail(env("TEST_ACCOUNT_EMAIL"));
  const testAccountPassword = env("TEST_ACCOUNT_PASSWORD");
  const testAccountOtpCode = env("TEST_ACCOUNT_OTP_CODE");

  if (!supabaseUrl || !publishableKey || !testAccountEmail || !testAccountPassword || !testAccountOtpCode) {
    return json({ error: "Test account login is not configured." }, 500);
  }

  const payload = (await request.json().catch(() => ({}))) as TestAccountLoginRequest;
  const email = normalizeEmail(payload.email);
  const passcode = payload.passcode?.trim() ?? "";

  if (!email || !passcode) {
    return json({ error: "Email and passcode are required." }, 400);
  }

  if (email !== testAccountEmail || passcode !== testAccountOtpCode) {
    return json({ error: "Invalid test account passcode." }, 401);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testAccountEmail,
    password: testAccountPassword,
  });

  if (error || !data.session) {
    return json({ error: error?.message ?? "Test account sign-in failed." }, 401);
  }

  return json({
    ok: true,
    message: "Test account signed in.",
    session: data.session,
  });
});
