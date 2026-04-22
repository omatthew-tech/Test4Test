import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
  type EmailEnvironment,
  type EmailTemplateRecord,
} from "./email-system.ts";
import { loadPendingReminderForPair } from "./test-back-reminders.ts";

export const newFeedbackTemplateKey = "new_feedback";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface NewFeedbackResponseRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  owner_notified_at: string | null;
  status: string;
  credit_awarded: boolean;
}

interface NewFeedbackEmailContext {
  ownerUserId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerProductName: string;
  testerUserId: string;
  responseId: string;
  submissionId: string;
  feedbackUrl: string;
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

interface SentNewFeedbackDeliveryRow {
  created_at: string;
}

async function loadSubmission(admin: SupabaseClient, submissionId: string) {
  const { data, error } = await admin
    .from("submissions")
    .select("id, product_name, user_id")
    .eq("id", submissionId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Submission not found.");
  }

  return data as SubmissionRow;
}

async function loadProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Submission owner not found.");
  }

  return data as ProfileRow;
}

async function loadSentNewFeedbackDelivery(admin: SupabaseClient, responseId: string) {
  const { data, error } = await admin
    .from("email_delivery_logs")
    .select("created_at")
    .eq("related_response_id", responseId)
    .eq("template_key", newFeedbackTemplateKey)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SentNewFeedbackDeliveryRow | null) ?? null;
}

async function markResponseOwnerNotified(admin: SupabaseClient, responseId: string, notifiedAt: string) {
  const { error } = await admin
    .from("test_responses")
    .update({ owner_notified_at: notifiedAt })
    .eq("id", responseId)
    .is("owner_notified_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

async function advanceReminderAfterNewFeedback(
  admin: SupabaseClient,
  ownerUserId: string,
  testerUserId: string,
  notifiedAt: string,
) {
  const reminder = await loadPendingReminderForPair(admin, ownerUserId, testerUserId);

  if (!reminder || reminder.status !== "pending" || reminder.emails_sent !== 0) {
    return;
  }

  const nextSendAt = new Date(new Date(notifiedAt).getTime() + DAY_IN_MS).toISOString();
  const { error } = await admin
    .from("test_back_reminder_sequences")
    .update({
      emails_sent: 1,
      last_sent_at: notifiedAt,
      next_send_at: nextSendAt,
      updated_at: notifiedAt,
    })
    .eq("id", reminder.id)
    .eq("status", "pending")
    .eq("emails_sent", 0);

  if (error) {
    throw new Error(error.message);
  }
}

export async function loadUnnotifiedNewFeedbackResponses(
  admin: SupabaseClient,
  limit: number,
  lookbackHours = 24 * 7,
) {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const submittedAfter = new Date(Date.now() - Math.max(1, lookbackHours) * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("test_responses")
    .select("id, submission_id, tester_user_id, owner_notified_at, status, credit_awarded")
    .eq("status", "approved")
    .eq("credit_awarded", true)
    .is("owner_notified_at", null)
    .gte("submitted_at", submittedAfter)
    .order("submitted_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as NewFeedbackResponseRow[];
}

export async function sendNewFeedbackNotification(
  admin: SupabaseClient,
  env: EmailEnvironment,
  context: NewFeedbackEmailContext,
  templateMap?: Map<string, EmailTemplateRecord>,
) {
  const templates = templateMap ?? (await loadEmailTemplates(admin, [newFeedbackTemplateKey]));
  const template = templates.get(newFeedbackTemplateKey);

  if (!template) {
    throw new Error(`Missing email template: ${newFeedbackTemplateKey}`);
  }

  const rendered = renderEmailTemplate(template, {
    ownerDisplayName: context.ownerDisplayName,
    ownerProductName: context.ownerProductName,
    feedbackUrl: context.feedbackUrl,
  });

  try {
    const sendResult = await sendEmail(env, {
      to: context.ownerEmail,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });

    await logEmailDelivery(admin, {
      templateKey: newFeedbackTemplateKey,
      recipientUserId: context.ownerUserId,
      recipientEmail: context.ownerEmail,
      relatedResponseId: context.responseId,
      relatedSubmissionId: context.submissionId,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: {
        testerUserId: context.testerUserId,
      },
    });
  } catch (error) {
    await logEmailDelivery(admin, {
      templateKey: newFeedbackTemplateKey,
      recipientUserId: context.ownerUserId,
      recipientEmail: context.ownerEmail,
      relatedResponseId: context.responseId,
      relatedSubmissionId: context.submissionId,
      subject: rendered.subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to send feedback notification.",
      metadata: {
        testerUserId: context.testerUserId,
      },
    }).catch(() => undefined);

    throw error;
  }

  return rendered;
}

export async function processNewFeedbackNotificationForResponse(
  admin: SupabaseClient,
  env: EmailEnvironment,
  response: NewFeedbackResponseRow,
  templateMap?: Map<string, EmailTemplateRecord>,
) {
  if (response.owner_notified_at) {
    return { outcome: "skipped" as const, reason: "already_notified" as const };
  }

  if (response.status !== "approved" || response.credit_awarded !== true) {
    return { outcome: "skipped" as const, reason: "not_approved" as const };
  }

  const [submission, sentDelivery] = await Promise.all([
    loadSubmission(admin, response.submission_id),
    loadSentNewFeedbackDelivery(admin, response.id),
  ]);
  const owner = await loadProfile(admin, submission.user_id);

  if (sentDelivery) {
    await markResponseOwnerNotified(admin, response.id, sentDelivery.created_at);
    await advanceReminderAfterNewFeedback(admin, owner.id, response.tester_user_id, sentDelivery.created_at);
    return { outcome: "skipped" as const, reason: "already_sent" as const };
  }

  const feedbackUrl = `${env.appBaseUrl}/my-tests/${submission.id}`;

  await sendNewFeedbackNotification(
    admin,
    env,
    {
      ownerUserId: owner.id,
      ownerEmail: owner.email,
      ownerDisplayName: owner.display_name,
      ownerProductName: submission.product_name,
      testerUserId: response.tester_user_id,
      responseId: response.id,
      submissionId: submission.id,
      feedbackUrl,
    },
    templateMap,
  );

  const notifiedAt = new Date().toISOString();
  await markResponseOwnerNotified(admin, response.id, notifiedAt);
  await advanceReminderAfterNewFeedback(admin, owner.id, response.tester_user_id, notifiedAt);

  return { outcome: "sent" as const };
}
