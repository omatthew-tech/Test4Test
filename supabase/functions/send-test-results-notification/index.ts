import {
  corsHeaders,
  createAdminClient,
  getEmailEnvironment,
  json,
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
} from "../_shared/email-system.ts";
import { loadPendingReminderForPair } from "../_shared/test-back-reminders.ts";

interface NotificationRequest {
  responseId?: string;
}

interface ResponseRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  owner_notified_at: string | null;
  status: string;
  credit_awarded: boolean;
}

interface SubmissionRow {
  id: string;
  product_name: string;
  user_id: string;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

async function advanceReminderAfterNewFeedback(
  admin: ReturnType<typeof createAdminClient>,
  reminderId: string,
  notifiedAt: string,
) {
  const nextSendAt = new Date(new Date(notifiedAt).getTime() + DAY_IN_MS).toISOString();
  const { error } = await admin
    .from("test_back_reminder_sequences")
    .update({
      emails_sent: 1,
      last_sent_at: notifiedAt,
      next_send_at: nextSendAt,
      updated_at: notifiedAt,
    })
    .eq("id", reminderId)
    .eq("status", "pending")
    .eq("emails_sent", 0);

  if (error) {
    throw new Error(error.message);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let env;

  try {
    env = getEmailEnvironment();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Notification setup is incomplete." }, 500);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return json({ error: "Unauthorized." }, 401);
  }

  const admin = createAdminClient(env);
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ error: userError?.message ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as NotificationRequest;
  const responseId = payload.responseId?.trim() ?? "";

  if (!responseId) {
    return json({ error: "Missing response id." }, 400);
  }

  const { data: responseRow, error: responseError } = await admin
    .from("test_responses")
    .select("id, submission_id, tester_user_id, owner_notified_at, status, credit_awarded")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return json({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  const responseRecord = responseRow as ResponseRow;

  if (responseRecord.tester_user_id !== user.id) {
    return json({ error: "You do not have permission to send this notification." }, 403);
  }

  if (responseRecord.owner_notified_at) {
    return json({ ok: true, skipped: true, message: "Notification already sent." });
  }

  if (responseRecord.status !== "approved" || responseRecord.credit_awarded !== true) {
    return json({ ok: true, skipped: true, message: "Notification will send after the response is approved." });
  }

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select("id, product_name, user_id")
    .eq("id", responseRecord.submission_id)
    .single();

  if (submissionError || !submission) {
    return json({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const submissionRecord = submission as SubmissionRow;
  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", submissionRecord.user_id)
    .single();

  if (ownerError || !owner) {
    return json({ error: ownerError?.message ?? "Submission owner not found." }, 404);
  }

  const ownerRecord = owner as ProfileRow;
  const reminder = await loadPendingReminderForPair(
    admin,
    submissionRecord.user_id,
    responseRecord.tester_user_id,
  );

  const templateMap = await loadEmailTemplates(admin, ["new_feedback"]);
  const template = templateMap.get("new_feedback");

  if (!template) {
    return json({ error: "Missing email template: new_feedback" }, 500);
  }

  const feedbackUrl = `${env.appBaseUrl}/my-tests/${submissionRecord.id}`;
  const rendered = renderEmailTemplate(template, {
    ownerDisplayName: ownerRecord.display_name,
    ownerProductName: submissionRecord.product_name,
    feedbackUrl,
  });

  try {
    const sendResult = await sendEmail(env, {
      to: ownerRecord.email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });

    await logEmailDelivery(admin, {
      templateKey: "new_feedback",
      recipientUserId: ownerRecord.id,
      recipientEmail: ownerRecord.email,
      relatedResponseId: responseRecord.id,
      relatedSubmissionId: submissionRecord.id,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: {
        testerUserId: responseRecord.tester_user_id,
      },
    });
  } catch (error) {
    await logEmailDelivery(admin, {
      templateKey: "new_feedback",
      recipientUserId: ownerRecord.id,
      recipientEmail: ownerRecord.email,
      relatedResponseId: responseRecord.id,
      relatedSubmissionId: submissionRecord.id,
      subject: rendered.subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to send feedback notification.",
      metadata: {
        testerUserId: responseRecord.tester_user_id,
      },
    }).catch(() => undefined);

    return json(
      { error: error instanceof Error ? error.message : "Failed to send feedback notification." },
      502,
    );
  }

  const notifiedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("test_responses")
    .update({ owner_notified_at: notifiedAt })
    .eq("id", responseRecord.id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  if (reminder && reminder.status === "pending" && reminder.emails_sent === 0) {
    try {
      await advanceReminderAfterNewFeedback(admin, reminder.id, notifiedAt);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Failed to schedule reminder follow-up." },
        500,
      );
    }
  }

  return json({ ok: true, message: "Notification sent." });
});
