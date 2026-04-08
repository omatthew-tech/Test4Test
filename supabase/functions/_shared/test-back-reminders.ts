import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
  type EmailEnvironment,
  type EmailTemplateRecord,
} from "./email-system.ts";

export interface ReminderSequenceRow {
  id: string;
  owner_user_id: string;
  tester_user_id: string;
  latest_triggering_response_id: string;
  latest_triggering_submission_id: string;
  emails_sent: number;
  next_send_at: string;
  status: "pending" | "resolved" | "cancelled";
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
  status: string;
  is_open_for_more_tests: boolean;
  promoted?: boolean | null;
  response_count: number;
  created_at: string;
}

interface TestBackRateTransitionRow {
  current_test_back_rate_percent: number | null;
  new_test_back_rate_percent: number | null;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const reminderTemplateKeys = [
  "test_back_reminder_stage_1",
  "test_back_reminder_stage_2",
  "test_back_reminder_stage_3",
] as const;

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getReminderTemplateKey(emailsSent: number) {
  if (emailsSent <= 0) {
    return "test_back_reminder_stage_1";
  }

  if (emailsSent === 1) {
    return "test_back_reminder_stage_2";
  }

  if (emailsSent === 2) {
    return "test_back_reminder_stage_3";
  }

  return null;
}

export async function loadPendingReminderForPair(
  admin: SupabaseClient,
  ownerUserId: string,
  testerUserId: string,
) {
  const { data, error } = await admin
    .from("test_back_reminder_sequences")
    .select("id, owner_user_id, tester_user_id, latest_triggering_response_id, latest_triggering_submission_id, emails_sent, next_send_at, status")
    .eq("owner_user_id", ownerUserId)
    .eq("tester_user_id", testerUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ReminderSequenceRow | null) ?? null;
}

export async function loadDueReminderSequences(admin: SupabaseClient, limit: number) {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("test_back_reminder_sequences")
    .select("id, owner_user_id, tester_user_id, latest_triggering_response_id, latest_triggering_submission_id, emails_sent, next_send_at, status")
    .eq("status", "pending")
    .lte("next_send_at", now)
    .order("next_send_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ReminderSequenceRow[];
}

export async function hasTestedBack(
  admin: SupabaseClient,
  ownerUserId: string,
  testerUserId: string,
) {
  const { data: testerSubmissions, error: submissionError } = await admin
    .from("submissions")
    .select("id")
    .eq("user_id", testerUserId);

  if (submissionError) {
    throw new Error(submissionError.message);
  }

  const submissionIds = (testerSubmissions ?? []).map((submission) => submission.id as string);

  if (submissionIds.length === 0) {
    return false;
  }

  const { data: response, error: responseError } = await admin
    .from("test_responses")
    .select("id")
    .eq("tester_user_id", ownerUserId)
    .eq("status", "approved")
    .eq("credit_awarded", true)
    .in("submission_id", submissionIds)
    .limit(1)
    .maybeSingle();

  if (responseError) {
    throw new Error(responseError.message);
  }

  return Boolean(response?.id);
}

export async function findTargetSubmission(
  admin: SupabaseClient,
  testerUserId: string,
  ownerUserId: string,
) {
  const { data: testerProfile, error: profileError } = await admin
    .from("profiles")
    .select("ban_status")
    .eq("id", testerUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (testerProfile && "ban_status" in testerProfile && testerProfile.ban_status === "banned") {
    return null;
  }

  const { data: candidateRows, error: candidateError } = await admin
    .from("submissions")
    .select("id, user_id, product_name, status, is_open_for_more_tests, promoted, response_count, created_at")
    .eq("user_id", testerUserId)
    .eq("status", "live")
    .eq("is_open_for_more_tests", true)
    .order("promoted", { ascending: false })
    .order("response_count", { ascending: true })
    .order("created_at", { ascending: false });

  if (candidateError) {
    throw new Error(candidateError.message);
  }

  const candidates = (candidateRows ?? []) as SubmissionRow[];

  if (candidates.length === 0) {
    return null;
  }

  const { data: testedRows, error: testedError } = await admin
    .from("test_responses")
    .select("submission_id")
    .eq("tester_user_id", ownerUserId)
    .eq("status", "approved")
    .eq("credit_awarded", true)
    .in(
      "submission_id",
      candidates.map((candidate) => candidate.id),
    );

  if (testedError) {
    throw new Error(testedError.message);
  }

  const testedSubmissionIds = new Set((testedRows ?? []).map((row) => row.submission_id as string));

  return candidates.find((candidate) => !testedSubmissionIds.has(candidate.id)) ?? null;
}

async function loadProfiles(admin: SupabaseClient, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)];
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", uniqueUserIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((profile) => [(profile as ProfileRow).id, profile as ProfileRow]));
}

async function loadSubmission(admin: SupabaseClient, submissionId: string) {
  const { data, error } = await admin
    .from("submissions")
    .select("id, user_id, product_name, status, is_open_for_more_tests, promoted, response_count, created_at")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SubmissionRow | null) ?? null;
}

async function loadFinalReminderRateTransition(
  admin: SupabaseClient,
  ownerUserId: string,
  pendingTesterUserId: string,
) {
  const { data, error } = await admin.rpc("get_test_back_rate_transition", {
    p_owner_user_id: ownerUserId,
    p_pending_tester_user_id: pendingTesterUserId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data)
    ? ((data[0] as TestBackRateTransitionRow | undefined) ?? null)
    : ((data as TestBackRateTransitionRow | null) ?? null);

  return {
    currentRatePercent: normalizePercent(row?.current_test_back_rate_percent),
    newRatePercent: normalizePercent(row?.new_test_back_rate_percent),
  };
}

async function resolveReminderSequence(
  admin: SupabaseClient,
  reminderId: string,
  status: "resolved" | "cancelled",
  reason: "tested_back" | "sequence_complete" | "missing_target_submission",
) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("test_back_reminder_sequences")
    .update({
      status,
      resolved_reason: reason,
      resolved_at: now,
      next_send_at: null,
      updated_at: now,
    })
    .eq("id", reminderId);

  if (error) {
    throw new Error(error.message);
  }
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

export async function processReminderSequence(
  admin: SupabaseClient,
  env: EmailEnvironment,
  reminder: ReminderSequenceRow,
  templateMap?: Map<string, EmailTemplateRecord>,
) {
  if (reminder.status !== "pending") {
    return { outcome: "skipped" as const };
  }

  const templateKey = getReminderTemplateKey(reminder.emails_sent);

  if (!templateKey) {
    await resolveReminderSequence(admin, reminder.id, "resolved", "sequence_complete");
    return { outcome: "resolved" as const, reason: "sequence_complete" as const };
  }

  const testedBack = await hasTestedBack(admin, reminder.owner_user_id, reminder.tester_user_id);

  if (testedBack) {
    await resolveReminderSequence(admin, reminder.id, "resolved", "tested_back");
    return { outcome: "resolved" as const, reason: "tested_back" as const };
  }

  const targetSubmission = await findTargetSubmission(admin, reminder.tester_user_id, reminder.owner_user_id);

  if (!targetSubmission) {
    await resolveReminderSequence(admin, reminder.id, "cancelled", "missing_target_submission");
    return { outcome: "cancelled" as const, reason: "missing_target_submission" as const };
  }

  const [profiles, triggeringSubmission, rateTransition] = await Promise.all([
    loadProfiles(admin, [reminder.owner_user_id, reminder.tester_user_id]),
    loadSubmission(admin, reminder.latest_triggering_submission_id),
    templateKey === "test_back_reminder_stage_3"
      ? loadFinalReminderRateTransition(admin, reminder.owner_user_id, reminder.tester_user_id)
      : Promise.resolve({ currentRatePercent: 100, newRatePercent: 100 }),
  ]);

  const owner = profiles.get(reminder.owner_user_id);
  const tester = profiles.get(reminder.tester_user_id);

  if (!owner || !tester || !triggeringSubmission) {
    throw new Error("Reminder context is incomplete.");
  }

  const templates = templateMap ?? (await loadEmailTemplates(admin, [templateKey]));
  const template = templates.get(templateKey);

  if (!template) {
    throw new Error(`Missing email template: ${templateKey}`);
  }

  const feedbackUrl = `${env.appBaseUrl}/my-tests/${triggeringSubmission.id}`;
  const testBackUrl = `${env.appBaseUrl}/test/${targetSubmission.id}`;
  const rendered = renderEmailTemplate(template, {
    ownerDisplayName: owner.display_name,
    ownerProductName: triggeringSubmission.product_name,
    testerDisplayName: tester.display_name,
    targetProductName: targetSubmission.product_name,
    feedbackUrl,
    testBackUrl,
    currentTestBackRatePercent: String(rateTransition.currentRatePercent),
    newTestBackRatePercent: String(rateTransition.newRatePercent),
  });

  try {
    const sendResult = await sendEmail(env, {
      to: owner.email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: owner.id,
      recipientEmail: owner.email,
      relatedResponseId: reminder.latest_triggering_response_id,
      relatedSubmissionId: reminder.latest_triggering_submission_id,
      reminderSequenceId: reminder.id,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: {
        stage: reminder.emails_sent + 1,
        testerUserId: tester.id,
        targetSubmissionId: targetSubmission.id,
        currentTestBackRatePercent: rateTransition.currentRatePercent,
        newTestBackRatePercent: rateTransition.newRatePercent,
      },
    });
  } catch (error) {
    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: owner.id,
      recipientEmail: owner.email,
      relatedResponseId: reminder.latest_triggering_response_id,
      relatedSubmissionId: reminder.latest_triggering_submission_id,
      reminderSequenceId: reminder.id,
      subject: rendered.subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to send reminder email.",
      metadata: {
        stage: reminder.emails_sent + 1,
        testerUserId: tester.id,
        targetSubmissionId: targetSubmission.id,
        currentTestBackRatePercent: rateTransition.currentRatePercent,
        newTestBackRatePercent: rateTransition.newRatePercent,
      },
    });
    throw error;
  }

  const sentAt = new Date().toISOString();
  const nextEmailsSent = reminder.emails_sent + 1;
  const nextSendAt = new Date(Date.now() + DAY_IN_MS).toISOString();
  const isFinalReminder = nextEmailsSent >= 3;
  const { error: updateError } = await admin
    .from("test_back_reminder_sequences")
    .update(
      isFinalReminder
        ? {
            emails_sent: nextEmailsSent,
            last_sent_at: sentAt,
            next_send_at: null,
            status: "resolved",
            resolved_reason: "sequence_complete",
            resolved_at: sentAt,
            affects_test_back_rate: true,
            updated_at: sentAt,
          }
        : {
            emails_sent: nextEmailsSent,
            last_sent_at: sentAt,
            next_send_at: nextSendAt,
            updated_at: sentAt,
          },
    )
    .eq("id", reminder.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (reminder.emails_sent === 0) {
    await markResponseOwnerNotified(admin, reminder.latest_triggering_response_id, sentAt);
  }

  return {
    outcome: "sent" as const,
    stage: nextEmailsSent,
    final: isFinalReminder,
  };
}
