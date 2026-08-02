import {
  createReportAdminClient,
  getReportSupabaseEnvironment,
  reportCorsHeaders,
  reportJson,
} from "../_shared/usability-reports.ts";

interface InviteRequest {
  shareId?: unknown;
}

interface ShareRow {
  id: string;
  report_id: string;
  owner_user_id: string;
  recipient_name: string;
  recipient_email: string;
  status: "sent" | "opened";
}

interface ReportRow {
  id: string;
  submission_id: string;
  report_number: number;
  report_name: string | null;
}

interface SubmissionRow {
  product_name: string;
}

interface ProfileRow {
  display_name: string;
  email: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: reportCorsHeaders });
  }

  if (request.method !== "POST") {
    return reportJson({ error: "Method not allowed." }, 405);
  }

  let env;

  try {
    env = getReportSupabaseEnvironment();
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "Report invitation setup is incomplete.",
    }, 500);
  }

  const payload = (await request.json().catch(() => ({}))) as InviteRequest;
  const shareId = typeof payload.shareId === "string" ? payload.shareId.trim() : "";

  if (!shareId) {
    return reportJson({ error: "Missing report invitation id." }, 400);
  }

  const admin = createReportAdminClient(env);
  const { data: shareData, error: shareError } = await admin
    .from("usability_report_shares")
    .select("id, report_id, owner_user_id, recipient_name, recipient_email, status")
    .eq("id", shareId)
    .in("status", ["sent", "opened"])
    .maybeSingle();

  if (shareError) {
    return reportJson({ error: shareError.message }, 500);
  }

  if (!shareData) {
    return reportJson({ error: "This report invitation is invalid or no longer available." }, 404);
  }

  const share = shareData as ShareRow;
  const [reportResult, senderResult] = await Promise.all([
    admin
      .from("usability_reports")
      .select("id, submission_id, report_number, report_name")
      .eq("id", share.report_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", share.owner_user_id)
      .maybeSingle(),
  ]);

  if (reportResult.error || !reportResult.data) {
    return reportJson({ error: reportResult.error?.message ?? "Report not found." }, 404);
  }

  const report = reportResult.data as ReportRow;
  const { data: submissionData, error: submissionError } = await admin
    .from("submissions")
    .select("product_name")
    .eq("id", report.submission_id)
    .maybeSingle();

  if (submissionError || !submissionData) {
    return reportJson({ error: submissionError?.message ?? "App not found." }, 404);
  }

  const submission = submissionData as SubmissionRow;
  const sender = senderResult.data as ProfileRow | null;

  return reportJson({
    ok: true,
    invitation: {
      shareId: share.id,
      reportId: report.id,
      reportName: report.report_name?.trim() || `Report ${report.report_number}`,
      productName: submission.product_name?.trim() || "Untitled app",
      recipientName: share.recipient_name,
      recipientEmail: share.recipient_email,
      senderName: sender?.display_name?.trim() || "A Test4Test user",
      senderEmail: sender?.email?.trim() || "",
    },
  });
});
