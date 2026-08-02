import { requireSupabase } from "./supabase";

export type SaveSharedReportRecipientInput = {
  reportId: string;
  recipientName: string;
  recipientEmail: string;
  createdByUserId: string;
};

export async function saveSharedReportRecipient({
  reportId,
  recipientName,
  recipientEmail,
  createdByUserId,
}: SaveSharedReportRecipientInput) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("shared_report_recipients")
    .insert({
      report_id: reportId,
      recipient_name: recipientName.trim(),
      recipient_email: recipientEmail.trim().toLowerCase(),
      created_by_user_id: createdByUserId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}