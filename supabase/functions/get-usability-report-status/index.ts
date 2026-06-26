import {
  createReportAdminClient,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  getReportWorkerEnvironment,
  getWorkerJob,
  markReportFailed,
  persistCompletedWorkerResult,
  reportCorsHeaders,
  reportJson,
  workerStatusToReportStatus,
  type ReportRow,
} from "../_shared/usability-reports.ts";

interface ReportStatusRequest {
  reportId?: string;
}

async function responseFromAuthError(error: unknown) {
  if (error instanceof Response) {
    const payload = await error.json().catch(() => ({ error: "Unauthorized." }));
    return reportJson(payload, error.status);
  }

  return null;
}

async function loadReport(
  admin: ReturnType<typeof createReportAdminClient>,
  reportId: string,
  ownerUserId: string,
) {
  const { data, error } = await admin
    .from("usability_reports")
    .select("id, owner_user_id, status, error_message, frame_count, source_response_count, completed_at, worker_job_id")
    .eq("id", reportId)
    .eq("owner_user_id", ownerUserId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Report not found.");
  }

  return data as ReportRow;
}

function statusResponse(report: Pick<ReportRow, "status" | "frame_count" | "error_message" | "completed_at">) {
  return reportJson({
    ok: true,
    status: report.status,
    frameCount: report.frame_count,
    errorMessage: report.error_message,
    completedAt: report.completed_at,
  });
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
    return reportJson({ error: error instanceof Error ? error.message : "AI Analysis setup is incomplete." }, 500);
  }

  const admin = createReportAdminClient(env);
  let user;

  try {
    user = await getAuthenticatedReportUser(admin, request);
  } catch (error) {
    const authResponse = await responseFromAuthError(error);
    if (authResponse) {
      return authResponse;
    }
    return reportJson({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as ReportStatusRequest;
  const reportId = payload.reportId?.trim() ?? "";

  if (!reportId) {
    return reportJson({ error: "Missing report id." }, 400);
  }

  let report: ReportRow;

  try {
    report = await loadReport(admin, reportId, user.id);
  } catch (error) {
    return reportJson({ error: error instanceof Error ? error.message : "Report not found." }, 404);
  }

  if (report.status === "completed" || report.status === "failed") {
    return statusResponse(report);
  }

  if (!report.worker_job_id) {
    const message = "This report does not have a video processing job.";
    await markReportFailed(admin, report.id, message);
    const failedReport = await loadReport(admin, reportId, user.id);
    return statusResponse(failedReport);
  }

  try {
    const workerEnv = getReportWorkerEnvironment();
    const workerJob = await getWorkerJob(workerEnv, report.worker_job_id);
    const nextStatus = workerStatusToReportStatus(workerJob.status);

    if (workerJob.status === "completed" && workerJob.result) {
      await persistCompletedWorkerResult(admin, report.id, workerJob.result);
    } else if (workerJob.status === "failed") {
      await markReportFailed(admin, report.id, workerJob.error ?? "The video processor could not finish this report.");
    } else if (nextStatus !== report.status) {
      const { error } = await admin
        .from("usability_reports")
        .update({ status: nextStatus })
        .eq("id", report.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    const updatedReport = await loadReport(admin, reportId, user.id);
    return statusResponse(updatedReport);
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "The report status could not be loaded.",
    }, 502);
  }
});
