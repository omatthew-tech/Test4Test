import { supabase } from "./supabase";

// Tracking never gates clipboard access or changes the button's feedback.
// The RPC derives ownership from the session; retries are safe across tabs.
export async function recordShareLinkCopyClick(submissionId: string, userId: string) {
  if (!supabase) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId) return;
      const { error } = await supabase.rpc("record_share_link_copy_click", {
        p_submission_id: submissionId,
      });
      if (!error || error.code === "42501") return;
    } catch {
      // Retry transport failures while preserving the actual clipboard result.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}
