import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  createAdminClient,
  escapeHtml,
  getEmailEnvironment,
  json,
  logEmailDelivery,
  sendEmail,
} from "../_shared/email-system.ts";

type ReportReason = "app_unavailable" | "requires_payment" | "suspicious_malware" | "other";

interface ReportRequest {
  submissionId?: string;
  reason?: string;
  message?: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
  status: string;
  access_url?: string | null;
  access_links?: Record<string, string> | null;
  product_type?: string | null;
  product_types?: string[] | null;
  needs_google_play_closed_testers?: boolean | null;
  google_play_closed_test_instructions?: string | null;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
}

interface SubmissionReportRow {
  id: string;
  submission_id: string;
  reporter_user_id: string;
  reason: ReportReason;
  message: string;
  status: "pending" | "dismissed" | "confirmed";
  support_notified_at: string | null;
}

const reasonLabels: Record<ReportReason, string> = {
  app_unavailable: "App unavailable",
  requires_payment: "Requires payment",
  suspicious_malware: "Looks suspicious/malware",
  other: "Other",
};

function normalizeReason(value: unknown): ReportReason | null {
  return value === "app_unavailable" ||
    value === "requires_payment" ||
    value === "suspicious_malware" ||
    value === "other"
    ? value
    : null;
}

function normalizeMessage(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1000) : "";
}

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

function formatAccessLinks(submission: SubmissionRow) {
  const accessLinks =
    submission.access_links && typeof submission.access_links === "object"
      ? submission.access_links
      : {};
  const entries = Object.entries(accessLinks)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([label, url]) => `${label}: ${url.trim()}`);

  if (entries.length > 0) {
    return entries.join("\n");
  }

  return submission.access_url?.trim() || "No app link found.";
}

function formatAccessLinksHtml(submission: SubmissionRow) {
  const accessLinks =
    submission.access_links && typeof submission.access_links === "object"
      ? submission.access_links
      : {};
  const entries = Object.entries(accessLinks)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([label, url]) => {
      const safeUrl = escapeHtml(url.trim());
      return `<li><strong>${escapeHtml(label)}:</strong> <a href="${safeUrl}" style="color: #a34f25;">${safeUrl}</a></li>`;
    });

  if (entries.length > 0) {
    return `<ul style="margin: 8px 0 0; padding-left: 20px;">${entries.join("")}</ul>`;
  }

  const accessUrl = submission.access_url?.trim();
  return accessUrl
    ? `<a href="${escapeHtml(accessUrl)}" style="color: #a34f25;">${escapeHtml(accessUrl)}</a>`
    : "No app link found.";
}

async function getAuthenticatedUser(admin: SupabaseClient, request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

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

async function loadProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Profile not found.");
  }

  return data as ProfileRow;
}

async function loadPendingReport(
  admin: SupabaseClient,
  submissionId: string,
  reporterUserId: string,
) {
  const { data, error } = await admin
    .from("submission_reports")
    .select("id, submission_id, reporter_user_id, reason, message, status, support_notified_at")
    .eq("submission_id", submissionId)
    .eq("reporter_user_id", reporterUserId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SubmissionReportRow | null) ?? null;
}

async function insertReport(
  admin: SupabaseClient,
  submissionId: string,
  reporterUserId: string,
  reason: ReportReason,
  message: string,
) {
  const { data, error } = await admin
    .from("submission_reports")
    .insert({
      submission_id: submissionId,
      reporter_user_id: reporterUserId,
      reason,
      message,
    })
    .select("id, submission_id, reporter_user_id, reason, message, status, support_notified_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await loadPendingReport(admin, submissionId, reporterUserId);

      if (existing) {
        return existing;
      }
    }

    throw new Error(error.message);
  }

  return data as SubmissionReportRow;
}

async function sendSupportNotification(
  admin: SupabaseClient,
  env: ReturnType<typeof getEmailEnvironment>,
  {
    report,
    submission,
    reporter,
    founder,
  }: {
    report: SubmissionReportRow;
    submission: SubmissionRow;
    reporter: ProfileRow;
    founder: ProfileRow;
  },
) {
  const supportEmail = getSupportEmail();
  const adminUrl = `${env.appBaseUrl}/admin?report=${encodeURIComponent(report.id)}`;
  const reasonLabel = reasonLabels[report.reason];
  const subject = `Reported app: ${submission.product_name}`;
  const message = report.message.trim() || "No custom message provided.";
  const closedTestContext = submission.needs_google_play_closed_testers
    ? [
        "",
        "Google Play closed test: yes",
        `Closed-test instructions: ${submission.google_play_closed_test_instructions?.trim() || "None provided."}`,
      ]
    : [];
  const textBody = [
    `A tester reported ${submission.product_name}.`,
    "",
    `Reason: ${reasonLabel}`,
    `Message: ${message}`,
    "",
    `Reporter: ${reporter.display_name} <${reporter.email}>`,
    `Reporter user id: ${reporter.id}`,
    `Founder: ${founder.display_name} <${founder.email}>`,
    `Founder user id: ${founder.id}`,
    `Submission id: ${submission.id}`,
    ...closedTestContext,
    "",
    "App links:",
    formatAccessLinks(submission),
    "",
    `Review report: ${adminUrl}`,
  ].join("\n");
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p>A tester reported <strong>${escapeHtml(submission.product_name)}</strong>.</p>
      <div style="margin: 18px 0; padding: 16px 18px; border: 1px solid rgba(216, 208, 200, 0.9); border-radius: 18px; background: #fffaf6;">
        <p style="margin: 0 0 6px;"><strong>Reason:</strong> ${escapeHtml(reasonLabel)}</p>
        <p style="margin: 0;"><strong>Message:</strong> ${escapeHtmlWithBreaks(message)}</p>
      </div>
      <div style="margin: 18px 0;">
        <p style="margin: 0 0 6px;"><strong>Reporter:</strong> ${escapeHtml(reporter.display_name)} &lt;${escapeHtml(reporter.email)}&gt;</p>
        <p style="margin: 0 0 6px;"><strong>Founder:</strong> ${escapeHtml(founder.display_name)} &lt;${escapeHtml(founder.email)}&gt;</p>
        <p style="margin: 0;"><strong>Submission id:</strong> ${escapeHtml(submission.id)}</p>
      </div>
      ${submission.needs_google_play_closed_testers ? `
        <div style="margin: 18px 0; padding: 14px 16px; border: 1px solid rgba(245, 142, 86, 0.35); border-radius: 14px; background: #fff3ea;">
          <p style="margin: 0 0 6px;"><strong>Google Play closed test:</strong> yes</p>
          <p style="margin: 0;"><strong>Instructions:</strong> ${escapeHtmlWithBreaks(submission.google_play_closed_test_instructions?.trim() || "None provided.")}</p>
        </div>
      ` : ""}
      <div style="margin: 18px 0;">
        <p style="margin: 0 0 6px; font-weight: 700;">App links</p>
        ${formatAccessLinksHtml(submission)}
      </div>
      <p>
        <a href="${escapeHtml(adminUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #1d1815; text-decoration: none; font-weight: 700;">
          Review report
        </a>
      </p>
      <p style="margin-top: 18px; color: #6f655d;">
        Or open this link directly:
        <a href="${escapeHtml(adminUrl)}" style="color: #a34f25;">${escapeHtml(adminUrl)}</a>
      </p>
    </div>
  `;

  const sendResult = await sendEmail(env, {
    to: supportEmail,
    subject,
    textBody,
    htmlBody,
    replyTo: supportEmail,
  });

  await logEmailDelivery(admin, {
    templateKey: "test_report_support",
    recipientEmail: supportEmail,
    relatedSubmissionId: submission.id,
    subject,
    status: "sent",
    providerMessageId: sendResult.providerMessageId,
    metadata: {
      reportId: report.id,
      reporterUserId: reporter.id,
      founderUserId: founder.id,
      reason: report.reason,
    },
  }).catch((error) => {
    console.error("Failed to log support report email.", error);
  });
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
    return json({ error: error instanceof Error ? error.message : "Report setup is incomplete." }, 500);
  }

  const admin = createAdminClient(env);
  const auth = await getAuthenticatedUser(admin, request);

  if (!auth.user) {
    return json({ error: auth.error ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as ReportRequest;
  const submissionId = payload.submissionId?.trim() ?? "";
  const reason = normalizeReason(payload.reason);
  const message = normalizeMessage(payload.message);

  if (!submissionId) {
    return json({ error: "Missing submission id." }, 400);
  }

  if (!reason) {
    return json({ error: "Choose a report reason." }, 400);
  }

  if (reason === "other" && !message) {
    return json({ error: "Tell us what happened before submitting an Other report." }, 400);
  }

  const { data: submissionRow, error: submissionError } = await admin
    .from("submissions")
    .select("id, user_id, product_name, status, access_url, access_links, product_type, product_types, needs_google_play_closed_testers, google_play_closed_test_instructions")
    .eq("id", submissionId)
    .single();

  if (submissionError || !submissionRow) {
    return json({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const submission = submissionRow as SubmissionRow;

  if (submission.status !== "live") {
    return json({ error: "That test is no longer live." }, 400);
  }

  if (submission.user_id === auth.user.id) {
    return json({ error: "You cannot report your own app from the Earn test flow." }, 403);
  }

  try {
    const [reporter, founder] = await Promise.all([
      loadProfile(admin, auth.user.id),
      loadProfile(admin, submission.user_id),
    ]);
    const existingReport = await loadPendingReport(admin, submission.id, auth.user.id);
    const report = existingReport ?? await insertReport(
      admin,
      submission.id,
      auth.user.id,
      reason,
      message,
    );

    if (!report.support_notified_at) {
      try {
        await sendSupportNotification(admin, env, {
          report,
          submission,
          reporter,
          founder,
        });

        await admin
          .from("submission_reports")
          .update({
            support_notified_at: new Date().toISOString(),
            support_notification_error: null,
          })
          .eq("id", report.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send support notification.";
        await admin
          .from("submission_reports")
          .update({ support_notification_error: errorMessage })
          .eq("id", report.id);
        return json({ error: errorMessage }, 502);
      }
    }

    return json({
      ok: true,
      reportId: report.id,
      duplicate: Boolean(existingReport),
      message: existingReport
        ? "This report is already in progress."
        : "Report submitted.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "We could not submit that report." }, 500);
  }
});
