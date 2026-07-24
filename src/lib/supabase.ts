import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  "";
export const testAccountEmail = import.meta.env.VITE_TEST_ACCOUNT_EMAIL?.trim().toLowerCase() ?? "";

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

export function isTestAccountEmail(email: string | null | undefined) {
  return Boolean(testAccountEmail && email?.trim().toLowerCase() === testAccountEmail);
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before using Test4Test.",
    );
  }

  return supabase;
}
