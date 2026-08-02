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
import {
  getAuthenticatedReportUser,
  getUsabilityReportAccess,
} from "../_shared/usability-reports.ts";

const templateKey = "usability_report_share_invite";

interface ShareReportRequest {
  reportId?: unknown;
  recipientName?: unknown;
  recipientEmail?: unknown;
}

interface ReportRow {
  id: string;
  submission_id: string;
  owner_user_id: string;
  report_number: number;
  report_name: string | null;
  status: string;
  submissions?: { product_name?: string | null } | Array<{ product_name?: string | null }> | null;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email: string) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getProductName(report: ReportRow) {
  const submission = Array.isArray(report.submissions)
    ? report.submissions[0]
    : report.submissions;
  return submission?.product_name?.trim() || "your app";
}

async function responseFromAuthError(error: unknown) {
  if (error instanceof Response) {
    const payload = await error.json().catch(() => ({ error: "Unauthorized." }));
    return json(payload, error.status);
  }

  return null;
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
    return json({
      error: error instanceof Error ? error.message : "Report sharing setup is incomplete.",
    }, 500);
  }

  const admin = createAdminClient(env);
  let user;

  try {
    user = await getAuthenticatedReportUser(admin, request);
  } catch (error) {
    const authResponse = await responseFromAuthError(error);
    if (authResponse) {
      return authResponse;
    }
    return json({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as ShareReportRequest;
  const reportId = typeof payload.reportId === "string" ? payload.reportId.trim() : "";
  const recipientName = normalizeName(payload.recipientName);
  const recipientEmail = normalizeEmail(payload.recipientEmail);

  if (!reportId) {
    return json({ error: "Missing report id." }, 400);
  }

  if (!recipientName) {
    return json({ error: "Enter the recipient's name." }, 400);
  }

  if (recipientName.length > 100) {
    return json({ error: "Recipient names must be 100 characters or fewer." }, 400);
  }

  if (!isValidEmail(recipientEmail)) {
    return json({ error: "Enter a valid recipient email address." }, 400);
  }

  if (recipientEmail === user.email?.trim().toLowerCase()) {
    return json({ error: "This report is already available to your account." }, 400);
  }

  const { data: reportData, error: reportError } = await admin
    .from("usability_reports")
    .select(`
      id,
      submission_id,
      owner_user_id,
      report_number,
      report_name,
      status,
      submissions (
        product_name
      )
    `)
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    return json({ error: reportError.message }, 500);
  }

  if (!reportData) {
    return json({ error: "Report not found." }, 404);
  }

  const report = reportData as ReportRow;

  let access;

  try {
    access = await getUsabilityReportAccess(admin, report.id, report.owner_user_id, user);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Report access could not be checked.",
    }, 500);
  }

  if (!access) {
    return json({ error: "Report not found." }, 404);
  }

  if (report.status !== "completed") {
    return json({ error: "Only completed reports can be shared." }, 400);
  }

  const { data: senderData, error: senderError } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (senderError) {
    return json({ error: senderError.message }, 500);
  }

  const sender = senderData as ProfileRow | null;
  const { data: recipientData } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .eq("email", recipientEmail)
    .maybeSingle();
  const recipient = recipientData as ProfileRow | null;

  if (recipient?.id === report.owner_user_id) {
    return json({ error: "This report is already available to that account." }, 400);
  }

  const now = new Date().toISOString();

  const { data: shareData, error: shareError } = await admin
    .from("usability_report_shares")
    .upsert({
      report_id: report.id,
      owner_user_id: user.id,
      recipient_user_id: recipient?.id ?? null,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      status: "pending",
      provider_message_id: null,
      error_message: null,
      invited_at: now,
      sent_at: null,
      opened_at: null,
    }, { onConflict: "report_id,recipient_email" })
    .select("id")
    .single();

  if (shareError || !shareData) {
    return json({ error: shareError?.message ?? "The report invitation could not be created." }, 500);
  }

  const reportName = report.report_name?.trim() || `Report ${report.report_number}`;
  const productName = getProductName(report);
  const senderName =
    normalizeName(sender?.display_name)
    || sender?.email?.trim()
    || "A Test4Test user";
  const reportUrl = `${env.appBaseUrl}/shared-report/${shareData.id}`;
  let subject = `${senderName} shared a usability report with you`;

  try {
    const templates = await loadEmailTemplates(admin, [templateKey]);
    const template = templates.get(templateKey);

    if (!template) {
      throw new Error(`Missing email template: ${templateKey}`);
    }

    const rendered = renderEmailTemplate(template, {
      recipientName,
      recipientEmail,
      senderName,
      reportName,
      productName,
      reportUrl,
    });
    subject = rendered.subject;

    const { error: accessUpdateError } = await admin
      .from("usability_report_shares")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", shareData.id);

    if (accessUpdateError) {
      throw new Error(accessUpdateError.message);
    }

    const sendResult = await sendEmail(env, {
      to: recipientEmail,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
      replyTo: sender?.email ?? user.email ?? null,
    });

    await admin
      .from("usability_report_shares")
      .update({
        provider_message_id: sendResult.providerMessageId,
      })
      .eq("id", shareData.id);

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: recipient?.id ?? null,
      recipientEmail,
      relatedSubmissionId: report.submission_id,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: {
        reportId: report.id,
        reportName,
        shareId: shareData.id,
        senderUserId: user.id,
        recipientName,
      },
    });

    return json({
      ok: true,
      share: {
        id: shareData.id,
        recipientName,
        recipientEmail,
        status: "sent",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The report invitation could not be sent.";

    await admin
      .from("usability_report_shares")
      .update({ status: "failed", error_message: message })
      .eq("id", shareData.id);

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: recipient?.id ?? null,
      recipientEmail,
      relatedSubmissionId: report.submission_id,
      subject,
      status: "failed",
      errorMessage: message,
      metadata: {
        reportId: report.id,
        reportName,
        shareId: shareData.id,
        senderUserId: user.id,
        recipientName,
      },
    }).catch(() => undefined);

    return json({ error: message }, 502);
  }
});
