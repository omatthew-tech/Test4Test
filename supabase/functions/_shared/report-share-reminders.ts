import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
  type EmailEnvironment,
  type EmailTemplateRecord,
} from "./email-system.ts";

export const reportShareReminderTemplateKeys = [
  "usability_report_share_reminder_1",
  "usability_report_share_reminder_2",
  "usability_report_share_reminder_3",
] as const;

export interface ReportShareReminderRow {
  id: string;
  report_id: string;
  owner_user_id: string;
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_email: string;
  reminders_sent: number;
  next_reminder_at: string;
}

interface ReportRow {
  id: string;
  submission_id: string;
  report_number: number;
  report_name: string | null;
  status: string;
}

interface ProfileRow {
  email: string;
  display_name: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function nextReportShareReminderAt(stageSent: number, sentAt: string) {
  if (stageSent >= 3) {
    return null;
  }

  const nextDelayDays = stageSent === 1 ? 2 : 3;
  return new Date(new Date(sentAt).getTime() + nextDelayDays * DAY_IN_MS).toISOString();
}

export async function loadDueReportShareReminders(admin: SupabaseClient, limit: number) {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const { data, error } = await admin
    .from("usability_report_shares")
    .select("id, report_id, owner_user_id, recipient_user_id, recipient_name, recipient_email, reminders_sent, next_reminder_at")
    .eq("status", "sent")
    .eq("delivery_method", "email")
    .is("opened_at", null)
    .lt("reminders_sent", 3)
    .not("next_reminder_at", "is", null)
    .lte("next_reminder_at", new Date().toISOString())
    .order("next_reminder_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ReportShareReminderRow[];
}

async function claimReminder(admin: SupabaseClient, reminder: ReportShareReminderRow) {
  const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("usability_report_shares")
    .update({ next_reminder_at: retryAt })
    .eq("id", reminder.id)
    .eq("status", "sent")
    .is("opened_at", null)
    .eq("reminders_sent", reminder.reminders_sent)
    .eq("next_reminder_at", reminder.next_reminder_at)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function processReportShareReminder(
  admin: SupabaseClient,
  env: EmailEnvironment,
  reminder: ReportShareReminderRow,
  templates: Map<string, EmailTemplateRecord>,
) {
  if (!(await claimReminder(admin, reminder))) {
    return { outcome: "skipped" as const };
  }

  const stage = reminder.reminders_sent + 1;
  const templateKey = reportShareReminderTemplateKeys[stage - 1];
  const template = templates.get(templateKey);

  if (!template) {
    throw new Error(`Missing email template: ${templateKey}`);
  }

  const [reportResult, senderResult] = await Promise.all([
    admin
      .from("usability_reports")
      .select("id, submission_id, report_number, report_name, status")
      .eq("id", reminder.report_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("email, display_name")
      .eq("id", reminder.owner_user_id)
      .maybeSingle(),
  ]);

  if (reportResult.error || !reportResult.data) {
    throw new Error(reportResult.error?.message ?? "The shared report no longer exists.");
  }

  const report = reportResult.data as ReportRow;

  if (report.status !== "completed") {
    await admin
      .from("usability_report_shares")
      .update({ next_reminder_at: null })
      .eq("id", reminder.id);
    return { outcome: "cancelled" as const };
  }

  const { data: submissionData, error: submissionError } = await admin
    .from("submissions")
    .select("product_name")
    .eq("id", report.submission_id)
    .maybeSingle();

  if (submissionError) {
    throw new Error(submissionError.message);
  }

  const sender = senderResult.data as ProfileRow | null;
  const senderName = normalizeName(sender?.display_name) || sender?.email?.trim() || "A Test4Test user";
  const reportName = report.report_name?.trim() || `Report ${report.report_number}`;
  const productName = (submissionData as { product_name?: string | null } | null)?.product_name?.trim() || "your app";
  const reportUrl = `${env.appBaseUrl}/shared-report/${reminder.id}`;
  const rendered = renderEmailTemplate(template, {
    recipientName: reminder.recipient_name,
    recipientEmail: reminder.recipient_email,
    senderName,
    reportName,
    productName,
    reportUrl,
  });

  try {
    const sendResult = await sendEmail(env, {
      to: reminder.recipient_email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
      replyTo: sender?.email ?? null,
    });
    const sentAt = new Date().toISOString();

    const { error: updateError } = await admin
      .from("usability_report_shares")
      .update({
        reminders_sent: stage,
        last_reminder_sent_at: sentAt,
        next_reminder_at: nextReportShareReminderAt(stage, sentAt),
        provider_message_id: sendResult.providerMessageId,
        error_message: null,
      })
      .eq("id", reminder.id)
      .eq("status", "sent")
      .is("opened_at", null);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: reminder.recipient_user_id,
      recipientEmail: reminder.recipient_email,
      relatedSubmissionId: report.submission_id,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: {
        reportId: report.id,
        reportName,
        shareId: reminder.id,
        senderUserId: reminder.owner_user_id,
        recipientName: reminder.recipient_name,
        stage,
      },
    }).catch((error) => {
      console.error("Failed to log report invitation reminder delivery", {
        shareId: reminder.id,
        stage,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { outcome: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The report reminder could not be sent.";
    const retryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await admin
      .from("usability_report_shares")
      .update({ next_reminder_at: retryAt, error_message: message })
      .eq("id", reminder.id)
      .eq("status", "sent")
      .is("opened_at", null);

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: reminder.recipient_user_id,
      recipientEmail: reminder.recipient_email,
      relatedSubmissionId: report.submission_id,
      subject: rendered.subject,
      status: "failed",
      errorMessage: message,
      metadata: {
        reportId: report.id,
        reportName,
        shareId: reminder.id,
        senderUserId: reminder.owner_user_id,
        recipientName: reminder.recipient_name,
        stage,
      },
    }).catch(() => undefined);

    throw error;
  }
}
