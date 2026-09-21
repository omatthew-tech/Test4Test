import { normalizeProductTypes, PRODUCT_TYPE_ORDER } from "./format";
import { requireSupabase } from "./supabase";
import { parseFounderWelcomeStatus } from "./founderWelcome";
import type { ProductType } from "../types";

export async function loadEarnPlatformPreferences(userId: string) {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (data.user?.id !== userId) throw new Error("Your sign-in changed. Please try again.");

  const metadata = data.user.user_metadata;
  const platforms: unknown = metadata.earn_platform_preferences;
  const productTypes =
    Array.isArray(platforms) &&
    platforms.every((platform) => PRODUCT_TYPE_ORDER.includes(platform as ProductType))
      ? normalizeProductTypes(platforms as ProductType[])
      : null;

  return {
    welcomeStatus: parseFounderWelcomeStatus(metadata.founder_welcome_v1),
    confirmed: metadata.earn_platform_preferences_confirmed === true,
    productTypes,
  };
}

export async function saveEarnPlatformPreferences(userId: string, productTypes: ProductType[]) {
  const supabase = requireSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user.id !== userId) {
    throw new Error("Your sign-in changed. Please try again.");
  }

  // These are user-editable preferences, never authorization or eligibility data.
  const { error } = await supabase.auth.updateUser({
    data: {
      earn_platform_preferences: normalizeProductTypes(productTypes),
      earn_platform_preferences_confirmed: true,
    },
  });
  if (error) throw error;
}
