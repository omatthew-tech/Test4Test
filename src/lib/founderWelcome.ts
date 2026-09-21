import { requireSupabase } from "./supabase";

export type FounderWelcomeStatus = "pending" | "completed" | "dismissed";
export type FounderWelcomeOutcome = Exclude<FounderWelcomeStatus, "pending">;

export function parseFounderWelcomeStatus(value: unknown): FounderWelcomeStatus | null {
  return value === "pending" || value === "completed" || value === "dismissed" ? value : null;
}

export async function saveFounderWelcome(userId: string, outcome: FounderWelcomeOutcome) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) {
    throw new Error("Your sign-in changed. Please try again.");
  }
  // User-editable presentation preference, never authorization data.
  const { error: saveError } = await supabase.auth.updateUser({
    data: { founder_welcome_v1: outcome },
  });
  if (saveError) throw saveError;
}
