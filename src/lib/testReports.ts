import {
  AdminReviewSubmission,
  AdminTestReport,
  SubmissionReportStatus,
  TestReportReason,
  TestReportStatus,
} from "../types";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

interface ReportTestResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  reportId?: string;
  duplicate?: boolean;
}

interface SubmissionReportStatusRow {
  submission_id: string;
  status: TestReportStatus;
}

interface ManageReportsResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  skipped?: boolean;
  reports?: AdminTestReport[];
  reviewSubmissions?: AdminReviewSubmission[];
}

export interface AdminReportsResult {
  message?: string;
  skipped?: boolean;
  reports: AdminTestReport[];
  reviewSubmissions: AdminReviewSubmission[];
}

function isMissingSubmissionReportsTableError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("submission_reports") && normalized.includes("does not exist");
}

function normalizeReportStatus(value: unknown): TestReportStatus | null {
  return value === "pending" || value === "dismissed" || value === "confirmed" ? value : null;
}

async function getAccessToken(fallbackMessage: string) {
  const supabase = requireSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error(error?.message ?? fallbackMessage);
  }

  return session.access_token;
}

async function parseFunctionResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    ManageReportsResponse | ReportTestResponse | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? payload?.message ?? response.statusText);
  }

  return payload;
}

export async function reportTest(submissionId: string, reason: TestReportReason, message: string) {
  if (!submissionId || !supabaseUrl || !supabasePublishableKey) {
    throw new Error("Reporting is not available in the current environment.");
  }

  const accessToken = await getAccessToken("Sign in to report this test.");
  const response = await fetch(`${supabaseUrl}/functions/v1/report-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({
      submissionId,
      reason,
      message,
    }),
  });

  return parseFunctionResponse(response) as Promise<ReportTestResponse>;
}

export async function loadMySubmissionReportStatuses() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("submission_reports")
    .select("submission_id, status")
    .in("status", ["pending", "dismissed", "confirmed"]);

  if (error) {
    if (isMissingSubmissionReportsTableError(error.message)) {
      return [] as SubmissionReportStatus[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as SubmissionReportStatusRow[]).flatMap((row) => {
    const status = normalizeReportStatus(row.status);

    if (!row.submission_id || !status) {
      return [];
    }

    return [
      {
        submissionId: row.submission_id,
        status,
      } satisfies SubmissionReportStatus,
    ];
  });
}

async function callManageReports(body: Record<string, unknown>) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Admin reporting is not available in the current environment.");
  }

  const accessToken = await getAccessToken("Sign in with an admin account to continue.");
  const response = await fetch(`${supabaseUrl}/functions/v1/manage-test-reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify(body),
  });
  const payload = (await parseFunctionResponse(response)) as ManageReportsResponse;

  return {
    message: payload.message,
    skipped: payload.skipped,
    reports: payload.reports ?? [],
    reviewSubmissions: payload.reviewSubmissions ?? [],
  } satisfies AdminReportsResult;
}

export function loadAdminTestReports() {
  return callManageReports({ action: "list" });
}

export function decideAdminTestReport(reportId: string, decision: "ok" | "not_ok") {
  return callManageReports({
    action: "decide",
    reportId,
    decision,
  });
}

export function restoreReportedSubmission(submissionId: string) {
  return callManageReports({
    action: "restore_submission",
    submissionId,
  });
}
