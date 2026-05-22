import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  createAdminClient,
  escapeHtml,
  getEmailEnvironment,
  json,
  logEmailDelivery,
  sendEmail,
  type EmailEnvironment,
} from "../_shared/email-system.ts";

interface ReminderRunRequest {
  limit?: number;
}

interface ParticipationRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  founder_user_id: string;
  started_on: string;
  required_days: number;
}

interface SubmissionRow {
  id: string;
  product_name: string;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
}

interface CheckInRow {
  check_in_date: string;
}

const templateKey = "google_play_closed_test_check_in_reminder";

function getSuppliedSecret(request: Request) {
  const directHeader = request.headers.get("x-reminder-secret")?.trim();

  if (directHeader) {
    return directHeader;
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function loadProfiles(admin: SupabaseClient, userIds: string[]) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", [...new Set(userIds)]);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
}

async function loadSubmissions(admin: SupabaseClient, submissionIds: string[]) {
  const { data, error } = await admin
    .from("submissions")
    .select("id, product_name")
    .in("id", [...new Set(submissionIds)]);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as SubmissionRow[]).map((submission) => [submission.id, submission]));
}

async function hasCheckedInToday(admin: SupabaseClient, participationId: string, today: string) {
  const { data, error } = await admin
    .from("google_play_closed_test_check_ins")
    .select("check_in_date")
    .eq("participation_id", participationId)
    .eq("check_in_date", today)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean((data as CheckInRow | null)?.check_in_date);
}

async function hasSentReminderToday(
  admin: SupabaseClient,
  participation: ParticipationRow,
  todayStartIso: string,
) {
  const { data, error } = await admin
    .from("email_delivery_logs")
    .select("id")
    .eq("template_key", templateKey)
    .eq("recipient_user_id", participation.tester_user_id)
    .eq("related_submission_id", participation.submission_id)
    .eq("status", "sent")
    .gte("created_at", todayStartIso)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function sendReminder(
  admin: SupabaseClient,
  env: EmailEnvironment,
  participation: ParticipationRow,
  tester: ProfileRow,
  submission: SubmissionRow,
  checkedInDays: number,
) {
  const testUrl = `${env.appBaseUrl}/test/${encodeURIComponent(participation.submission_id)}`;
  const dayLabel = `${Math.min(checkedInDays + 1, participation.required_days)} of ${participation.required_days}`;
  const subject = `Check in for ${submission.product_name}'s Google Play closed test`;
  const textBody = [
    `Hi ${tester.display_name},`,
    "",
    `You are testing ${submission.product_name} for Google Play's 14-day closed-test requirement.`,
    `Today is day ${dayLabel}. Open the app and check in before the day ends to keep the streak consecutive.`,
    "",
    testUrl,
  ].join("\n");
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p>Hi ${escapeHtml(tester.display_name)},</p>
      <p>You are testing <strong>${escapeHtml(submission.product_name)}</strong> for Google Play's 14-day closed-test requirement.</p>
      <p>Today is day <strong>${escapeHtml(dayLabel)}</strong>. Open the app and check in before the day ends to keep the streak consecutive.</p>
      <p>
        <a href="${escapeHtml(testUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #1d1815; text-decoration: none; font-weight: 700;">
          Check in today
        </a>
      </p>
    </div>
  `;

  try {
    const result = await sendEmail(env, {
      to: tester.email,
      subject,
      textBody,
      htmlBody,
    });

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: tester.id,
      recipientEmail: tester.email,
      relatedSubmissionId: submission.id,
      subject,
      status: "sent",
      providerMessageId: result.providerMessageId,
      metadata: {
        participationId: participation.id,
        checkedInDays,
      },
    });
  } catch (error) {
    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: tester.id,
      recipientEmail: tester.email,
      relatedSubmissionId: submission.id,
      subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to send closed-test reminder.",
      metadata: {
        participationId: participation.id,
        checkedInDays,
      },
    }).catch(() => undefined);

    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("TEST_BACK_REMINDER_CRON_SECRET")?.trim() ?? "";

  if (!expectedSecret) {
    return json({ error: "Missing reminder cron secret." }, 500);
  }

  const suppliedSecret = getSuppliedSecret(request);

  if (!suppliedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: "Unauthorized." }, 401);
  }

  let env: EmailEnvironment;

  try {
    env = getEmailEnvironment();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Notification setup is incomplete." }, 500);
  }

  const payload = (await request.json().catch(() => ({}))) as ReminderRunRequest;
  const limit = Math.max(1, Math.min(100, typeof payload.limit === "number" ? payload.limit : 50));
  const admin = createAdminClient(env);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayStartIso = startOfUtcDay(now).toISOString();
  const errors: string[] = [];

  const { data: missedData, error: missedError } = await admin.rpc(
    "mark_missed_google_play_closed_tests",
    { p_reference_date: today },
  );

  if (missedError) {
    return json({ error: missedError.message }, 500);
  }

  const { data, error } = await admin
    .from("google_play_closed_test_participations")
    .select("id, submission_id, tester_user_id, founder_user_id, started_on, required_days")
    .eq("status", "active")
    .order("started_on", { ascending: true })
    .limit(limit);

  if (error) {
    return json({ error: error.message }, 500);
  }

  const participations = (data ?? []) as ParticipationRow[];
  const [profilesById, submissionsById] = await Promise.all([
    loadProfiles(admin, participations.map((participation) => participation.tester_user_id)),
    loadSubmissions(admin, participations.map((participation) => participation.submission_id)),
  ]);
  let sent = 0;
  let skipped = 0;

  for (const participation of participations) {
    try {
      const [checkedInToday, sentToday] = await Promise.all([
        hasCheckedInToday(admin, participation.id, today),
        hasSentReminderToday(admin, participation, todayStartIso),
      ]);

      if (checkedInToday || sentToday) {
        skipped += 1;
        continue;
      }

      const { count, error: countError } = await admin
        .from("google_play_closed_test_check_ins")
        .select("id", { count: "exact", head: true })
        .eq("participation_id", participation.id);

      if (countError) {
        throw new Error(countError.message);
      }

      const tester = profilesById.get(participation.tester_user_id);
      const submission = submissionsById.get(participation.submission_id);

      if (!tester || !submission) {
        skipped += 1;
        continue;
      }

      await sendReminder(
        admin,
        env,
        participation,
        tester,
        submission,
        count ?? 0,
      );
      sent += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to send closed-test reminder.");
    }
  }

  return json({
    ok: errors.length === 0,
    processed: participations.length,
    missedMarked: typeof missedData === "number" ? missedData : 0,
    sent,
    skipped,
    errors,
  });
});
