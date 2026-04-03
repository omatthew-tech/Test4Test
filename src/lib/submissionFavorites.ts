import { requireSupabase } from "./supabase";

interface SubmissionFavoriteRow {
  test_response_id: string;
}

export async function loadSubmissionFavoriteResponseIds() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("test_response_favorites")
    .select("test_response_id")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SubmissionFavoriteRow[])
    .map((row) => row.test_response_id)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export async function syncSubmissionFavorites(userId: string, responseIds: string[]) {
  if (responseIds.length === 0) {
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase
    .from("test_response_favorites")
    .upsert(
      responseIds.map((responseId) => ({
        user_id: userId,
        test_response_id: responseId,
      })),
      {
        onConflict: "user_id,test_response_id",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function addSubmissionFavorite(userId: string, responseId: string) {
  await syncSubmissionFavorites(userId, [responseId]);
}

export async function removeSubmissionFavorite(userId: string, responseId: string) {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("test_response_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("test_response_id", responseId);

  if (error) {
    throw new Error(error.message);
  }
}