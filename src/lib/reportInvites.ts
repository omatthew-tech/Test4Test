import { supabasePublishableKey, supabaseUrl } from "./supabase";

export interface UsabilityReportInvitation {
  shareId: string;
  reportId: string;
  reportName: string;
  productName: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
}

interface InviteResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  invitation?: UsabilityReportInvitation;
}

export async function getUsabilityReportInvitation(
  shareId: string,
): Promise<UsabilityReportInvitation> {
  if (!shareId) {
    throw new Error("This report invitation is invalid.");
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Report invitations are not available in the current environment.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/get-usability-report-invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({ shareId }),
  });
  const payload = (await response.json().catch(() => null)) as InviteResponse | null;

  if (!response.ok || !payload?.ok || !payload.invitation) {
    throw new Error(
      payload?.error
        ?? payload?.message
        ?? "This report invitation is invalid or no longer available.",
    );
  }

  return payload.invitation;
}
