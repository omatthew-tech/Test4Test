import { useState } from "react";
import { requireSupabase } from "./supabase";

export function useEmailLinkRevocation() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await requireSupabase().rpc("revoke_my_email_access_links");
      if (error) throw error;
      setFailed(false);
      setMessage(
        "Existing email sign-in links have been invalidated. You are still signed in. Future emails can include new links.",
      );
    } catch {
      setFailed(true);
      setMessage("We couldn’t invalidate your email links. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, failed, revoke };
}
