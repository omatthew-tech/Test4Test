import { createClient } from "npm:@supabase/supabase-js@2";

export const recordingCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-recording-cleanup-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function recordingJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...recordingCorsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function getRecordingEnvironment() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";
  const cleanupSecret = Deno.env.get("RECORDING_CLEANUP_CRON_SECRET")?.trim() ?? "";

  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing Supabase server secrets for response recordings.");
  }

  return {
    supabaseUrl,
    secretKey,
    cleanupSecret,
  };
}

export function createRecordingAdminClient(env: ReturnType<typeof getRecordingEnvironment>) {
  return createClient(env.supabaseUrl, env.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
