import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
  type EmailEnvironment,
  type EmailTemplateRecord,
} from "./email-system.ts";

export const newFeedbackTemplateKey = "new_feedback";

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
