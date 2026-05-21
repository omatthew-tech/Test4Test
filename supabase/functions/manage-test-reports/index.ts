import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  createAdminClient,
  escapeHtml,
  getEmailEnvironment,
  json,
  logEmailDelivery,
  sendEmail,
} from "../_shared/email-system.ts";

type ReportDecision = "ok" | "not_ok";

interface ManageReportsRequest {
  action?: "list" | "decide" | "restore_submission";
  reportId?: string;
  submissionId?: string;
  decision?: ReportDecision;
}

interface ReportRow {
  id: string;
  submission_id: string;
  reporter_user_id: string;
  reason: "app_unavailable" | "requires_payment" | "suspicious_malware" | "other";
  message: string;
  status: "pending" | "dismissed" | "confirmed";
  support_notified_at: string | null;
  decision_note: string;
  decided_by_user_id: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  credited_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
  status: string;
  description: string | null;
  access_url?: string | null;
  access_links?: Record<string, string> | null;
  product_type?: string | null;
  product_types?: string[] | null;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
}

const reasonLabels: Record<ReportRow["reason"], string> = {
  app_unavailable: "App unavailable",
  requires_payment: "Requires payment",
  suspicious_malware: "Looks suspicious/malware",
  other: "Other",
};

function escapeHtmlWithBreaks(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function getSupportEmail() {
  return (
    Deno.env.get("TEST_REPORT_SUPPORT_EMAIL")?.trim() ||
    Deno.env.get("SUPPORT_EMAIL")?.trim() ||
    "support@test4test.io"
  );
}

function getAccessToken(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

async function getAuthenticatedUser(admin: SupabaseClient, request: Request) {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return { user: null, error: "Unauthorized." };
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user) {
    return { user: null, error: error?.message ?? "Unauthorized." };
  }

  return { user, error: null };
}

async function requireAdminUser(admin: SupabaseClient, request: Request) {
  const auth = await getAuthenticatedUser(admin, request);

  if (!auth.user) {
    return { user: null, error: auth.error ?? "Unauthorized.", status: 401 };
  }

  const email = auth.user.email?.trim().toLowerCase() ?? "";

  if (!email) {
    return { user: null, error: "Your account does not have an email address.", status: 403 };
  }

  const { data, error } = await admin
    .from("admin_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return { user: null, error: error.message, status: 500 };
  }

  if (!data) {
    return { user: null, error: "You do not have admin access.", status: 403 };
  }

  await admin
    .from("admin_users")
    .update({ user_id: auth.user.id })
    .eq("email", email)
    .is("user_id", null)
    .then(() => undefined);

  return { user: auth.user, error: null, status: 200 };
}

async function loadProfiles(admin: SupabaseClient, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueUserIds.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", uniqueUserIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
}

async function loadSubmissions(admin: SupabaseClient, submissionIds: string[]) {
  const uniqueSubmissionIds = [...new Set(submissionIds.filter(Boolean))];

  if (uniqueSubmissionIds.length === 0) {
    return new Map<string, SubmissionRow>();
  }

  const { data, error } = await admin
    .from("submissions")
    .select("id, user_id, product_name, status, description, access_url, access_links, product_type, product_types")
    .in("id", uniqueSubmissionIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as SubmissionRow[]).map((submission) => [submission.id, submission]));
}

async function loadReport(admin: SupabaseClient, reportId: string) {
  const { data, error } = await admin
    .from("submission_reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Report not found.");
  }

  return data as ReportRow;
}

async function buildReportPayload(admin: SupabaseClient, rows: ReportRow[]) {
  const submissionsById = await loadSubmissions(admin, rows.map((report) => report.submission_id));
  const profileIds = rows.flatMap((report) => {
    const submission = submissionsById.get(report.submission_id);
    return submission ? [report.reporter_user_id, submission.user_id] : [report.reporter_user_id];
  });
  const profilesById = await loadProfiles(admin, profileIds);

  const reports = rows.flatMap((report) => {
    const submission = submissionsById.get(report.submission_id);
    const reporter = profilesById.get(report.reporter_user_id);
    const founder = submission ? profilesById.get(submission.user_id) : null;

    if (!submission || !reporter || !founder) {
      return [];
    }

    return [{
      id: report.id,
      submissionId: report.submission_id,
      reporterUserId: report.reporter_user_id,
      reporterEmail: reporter.email,
      reporterDisplayName: reporter.display_name,
      founderUserId: founder.id,
      founderEmail: founder.email,
      founderDisplayName: founder.display_name,
      appName: submission.product_name,
      appDescription: submission.description ?? "",
      appStatus: submission.status,
      reason: report.reason,
      reasonLabel: reasonLabels[report.reason],
      message: report.message,
      status: report.status,
      supportNotifiedAt: report.support_notified_at,
      decisionNote: report.decision_note,
      decidedByEmail: report.decided_by_email,
      decidedAt: report.decided_at,
      creditedTransactionId: report.credited_transaction_id,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
      accessLinks: normalizeAccessLinks(submission),
    }];
  });

  const reviewSubmissions = reports
    .filter((report) => report.status === "confirmed" && report.appStatus === "pending_verification")
    .filter((report, index, all) => all.findIndex((item) => item.submissionId === report.submissionId) === index)
    .map((report) => ({
      submissionId: report.submissionId,
      appName: report.appName,
      founderEmail: report.founderEmail,
      founderDisplayName: report.founderDisplayName,
      latestReportId: report.id,
      reasonLabel: report.reasonLabel,
      updatedAt: report.updatedAt,
    }));

  return { reports, reviewSubmissions };
}

function normalizeAccessLinks(submission: SubmissionRow) {
  const accessLinks =
    submission.access_links && typeof submission.access_links === "object"
      ? submission.access_links
      : {};
  const entries = Object.entries(accessLinks)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([productType, url]) => ({ productType, url: url.trim() }));

  if (entries.length > 0) {
    return entries;
  }

  return submission.access_url?.trim()
    ? [{ productType: submission.product_type ?? "website", url: submission.access_url.trim() }]
    : [];
}

async function listReports(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("submission_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return buildReportPayload(admin, (data ?? []) as ReportRow[]);
}

async function logModerationEmail(
  admin: SupabaseClient,
  {
    templateKey,
    recipientUserId,
    recipientEmail,
    submissionId,
    reportId,
    subject,
    status,
    providerMessageId,
    errorMessage,
  }: {
    templateKey: string;
    recipientUserId: string;
    recipientEmail: string;
    submissionId: string;
    reportId: string;
    subject: string;
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
  },
) {
  await logEmailDelivery(admin, {
    templateKey,
    recipientUserId,
    recipientEmail,
    relatedSubmissionId: submissionId,
    subject,
    status,
    providerMessageId,
    errorMessage,
    metadata: { reportId },
  }).catch((error) => {
    console.error("Failed to log moderation email.", error);
  });
}

async function sendReporterOkEmail(
  admin: SupabaseClient,
  env: ReturnType<typeof getEmailEnvironment>,
  report: ReportRow,
  submission: SubmissionRow,
  reporter: ProfileRow,
) {
  const supportEmail = getSupportEmail();
  const earnUrl = `${env.appBaseUrl}/earn`;
  const reasonLabel = reasonLabels[report.reason];
  const subject = `We reviewed your report for ${submission.product_name}`;
  const textBody = [
    `We investigated your report for ${submission.product_name}.`,
    "",
    `Reported reason: ${reasonLabel}`,
    "",
    "The app is safe to test. You can complete it from the Earn page:",
    earnUrl,
    "",
    `If there is still an issue, reply to this email and ${supportEmail} will receive it.`,
  ].join("\n");
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p>We investigated your report for <strong>${escapeHtml(submission.product_name)}</strong>.</p>
      <p>The app is safe to test.</p>
      <p>
        <a href="${escapeHtml(earnUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #1d1815; text-decoration: none; font-weight: 700;">
          Go to Earn
        </a>
      </p>
      <p style="color: #6f655d;">If there is still an issue, reply to this email and ${escapeHtml(supportEmail)} will receive it.</p>
    </div>
  `;

  const sendResult = await sendEmail(env, {
    to: reporter.email,
    subject,
    textBody,
    htmlBody,
    replyTo: supportEmail,
  });

  await logModerationEmail(admin, {
    templateKey: "test_report_reporter_ok",
    recipientUserId: reporter.id,
    recipientEmail: reporter.email,
    submissionId: submission.id,
    reportId: report.id,
    subject,
    status: "sent",
    providerMessageId: sendResult.providerMessageId,
  });
}

async function sendReporterNotOkEmail(
  admin: SupabaseClient,
  env: ReturnType<typeof getEmailEnvironment>,
  report: ReportRow,
  submission: SubmissionRow,
  reporter: ProfileRow,
) {
  const supportEmail = getSupportEmail();
  const subject = `Thanks for reporting ${submission.product_name}`;
  const textBody = [
    `Thanks for reporting ${submission.product_name}.`,
    "",
    "We investigated the app and confirmed there was a problem. We added a free credit to your account, and you do not need to test this app.",
    "",
    `If you have any questions, reply to this email and ${supportEmail} will receive it.`,
  ].join("\n");
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p>Thanks for reporting <strong>${escapeHtml(submission.product_name)}</strong>.</p>
      <p>We investigated the app and confirmed there was a problem. We added a free credit to your account, and you do not need to test this app.</p>
      <p style="color: #6f655d;">If you have any questions, reply to this email and ${escapeHtml(supportEmail)} will receive it.</p>
    </div>
  `;

  const sendResult = await sendEmail(env, {
    to: reporter.email,
    subject,
    textBody,
    htmlBody,
    replyTo: supportEmail,
  });

  await logModerationEmail(admin, {
    templateKey: "test_report_reporter_not_ok",
    recipientUserId: reporter.id,
    recipientEmail: reporter.email,
    submissionId: submission.id,
    reportId: report.id,
    subject,
    status: "sent",
    providerMessageId: sendResult.providerMessageId,
  });
}

async function sendFounderNotOkEmail(
  admin: SupabaseClient,
  env: ReturnType<typeof getEmailEnvironment>,
  report: ReportRow,
  submission: SubmissionRow,
  founder: ProfileRow,
) {
  const supportEmail = getSupportEmail();
  const myTestsUrl = `${env.appBaseUrl}/my-tests`;
  const reasonLabel = reasonLabels[report.reason];
  const customMessage = report.message.trim() || "No custom message was provided.";
  const subject = `${submission.product_name} has been paused`;
  const textBody = [
    `${submission.product_name} has been paused after a tester report.`,
    "",
    `Reason: ${reasonLabel}`,
    `Message: ${customMessage}`,
    "",
    "Go to My Apps and click \"Edit app\" to make changes. After you save edits, the app will move to pending verification for support review.",
    myTestsUrl,
    "",
    `If you disagree, reply to this email and ${supportEmail} will receive it.`,
  ].join("\n");
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p><strong>${escapeHtml(submission.product_name)}</strong> has been paused after a tester report.</p>
      <div style="margin: 18px 0; padding: 16px 18px; border: 1px solid rgba(216, 208, 200, 0.9); border-radius: 18px; background: #fffaf6;">
        <p style="margin: 0 0 6px;"><strong>Reason:</strong> ${escapeHtml(reasonLabel)}</p>
        <p style="margin: 0;"><strong>Message:</strong> ${escapeHtmlWithBreaks(customMessage)}</p>
      </div>
      <p>Go to My Apps and click <strong>Edit app</strong> to make changes. After you save edits, the app will move to pending verification for support review.</p>
      <p>
        <a href="${escapeHtml(myTestsUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #1d1815; text-decoration: none; font-weight: 700;">
          Open My Apps
        </a>
      </p>
      <p style="color: #6f655d;">If you disagree, reply to this email and ${escapeHtml(supportEmail)} will receive it.</p>
    </div>
  `;

  const sendResult = await sendEmail(env, {
    to: founder.email,
    subject,
    textBody,
    htmlBody,
    replyTo: supportEmail,
  });

  await logModerationEmail(admin, {
    templateKey: "test_report_founder_not_ok",
    recipientUserId: founder.id,
    recipientEmail: founder.email,
    submissionId: submission.id,
    reportId: report.id,
    subject,
    status: "sent",
    providerMessageId: sendResult.providerMessageId,
  });
}

async function decideReport(
  admin: SupabaseClient,
  env: ReturnType<typeof getEmailEnvironment>,
  user: User,
  reportId: string,
  decision: ReportDecision,
) {
  const report = await loadReport(admin, reportId);

  if (report.status !== "pending") {
    return { skipped: true, message: "This report has already been decided." };
  }

  const submissionsById = await loadSubmissions(admin, [report.submission_id]);
  const submission = submissionsById.get(report.submission_id);

  if (!submission) {
    throw new Error("Submission not found.");
  }

  const profilesById = await loadProfiles(admin, [report.reporter_user_id, submission.user_id]);
  const reporter = profilesById.get(report.reporter_user_id);
  const founder = profilesById.get(submission.user_id);

  if (!reporter || !founder) {
    throw new Error("Reporter or founder profile not found.");
  }

  const decidedAt = new Date().toISOString();
  const decidedByEmail = user.email?.trim().toLowerCase() ?? null;

  if (decision === "ok") {
    const { error } = await admin
      .from("submission_reports")
      .update({
        status: "dismissed",
        decision_note: "Support reviewed this report and decided the app is okay to test.",
        decided_at: decidedAt,
        decided_by_user_id: user.id,
        decided_by_email: decidedByEmail,
      })
      .eq("id", report.id)
      .eq("status", "pending");

    if (error) {
      throw new Error(error.message);
    }

    await sendReporterOkEmail(admin, env, report, submission, reporter);
    return { skipped: false, message: "Reporter notified that the app is okay to test." };
  }

  const { error: pauseError } = await admin
    .from("submissions")
    .update({ status: "paused" })
    .eq("id", submission.id);

  if (pauseError) {
    throw new Error(pauseError.message);
  }

  let creditedTransactionId = report.credited_transaction_id;

  if (!creditedTransactionId) {
    const { data: creditRow, error: creditError } = await admin
      .from("credit_transactions")
      .insert({
        user_id: reporter.id,
        type: "adjustment",
        amount: 1,
        reason: `Reported ${submission.product_name}; app paused after support review`,
      })
      .select("id")
      .single();

    if (creditError || !creditRow) {
      throw new Error(creditError?.message ?? "Credit could not be added.");
    }

    creditedTransactionId = creditRow.id;
  }

  const { error: reportUpdateError } = await admin
    .from("submission_reports")
    .update({
      status: "confirmed",
      decision_note: "Support confirmed the app should not be tested.",
      decided_at: decidedAt,
      decided_by_user_id: user.id,
      decided_by_email: decidedByEmail,
      credited_transaction_id: creditedTransactionId,
    })
    .eq("id", report.id)
    .eq("status", "pending");

  if (reportUpdateError) {
    throw new Error(reportUpdateError.message);
  }

  await sendReporterNotOkEmail(admin, env, report, submission, reporter);
  await sendFounderNotOkEmail(admin, env, report, submission, founder);

  return { skipped: false, message: "App paused. Reporter and founder notified." };
}

async function restoreSubmission(admin: SupabaseClient, submissionId: string) {
  const { error } = await admin
    .from("submissions")
    .update({ status: "live" })
    .eq("id", submissionId)
    .eq("status", "pending_verification");

  if (error) {
    throw new Error(error.message);
  }

  return { message: "Submission restored to live." };
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
    return json({ error: error instanceof Error ? error.message : "Admin setup is incomplete." }, 500);
  }

  const admin = createAdminClient(env);
  const adminAuth = await requireAdminUser(admin, request);

  if (!adminAuth.user) {
    return json({ error: adminAuth.error }, adminAuth.status);
  }

  const payload = (await request.json().catch(() => ({}))) as ManageReportsRequest;
  const action = payload.action ?? "list";

  try {
    if (action === "list") {
      const data = await listReports(admin);
      return json({ ok: true, ...data });
    }

    if (action === "decide") {
      const reportId = payload.reportId?.trim() ?? "";
      const decision = payload.decision;

      if (!reportId || (decision !== "ok" && decision !== "not_ok")) {
        return json({ error: "Missing report decision." }, 400);
      }

      const result = await decideReport(admin, env, adminAuth.user, reportId, decision);
      const data = await listReports(admin);
      return json({ ok: true, ...result, ...data });
    }

    if (action === "restore_submission") {
      const submissionId = payload.submissionId?.trim() ?? "";

      if (!submissionId) {
        return json({ error: "Missing submission id." }, 400);
      }

      const result = await restoreSubmission(admin, submissionId);
      const data = await listReports(admin);
      return json({ ok: true, ...result, ...data });
    }

    return json({ error: "Unsupported admin action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Admin request failed." }, 500);
  }
});
