import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ||
    "";
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";
  const authHeader = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !secretKey) {
    return json({ error: "Missing Supabase server secrets for account deletion." }, 500);
  }

  if (!authHeader.trim()) {
    return json({ error: "Unauthorized." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: "Unauthorized." }, 401);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  const { error: cleanupError } = await admin.rpc("delete_account_data_for_user", {
    target_user_id: user.id,
  });

  if (cleanupError) {
    console.error("delete_account_data_for_user failed", cleanupError);
  }

  return json({
    ok: true,
    message: "Your account and associated data have been deleted.",
  });
});