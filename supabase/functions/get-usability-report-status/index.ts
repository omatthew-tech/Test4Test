import {
  createReportAdminClient,
  createReportFrameSignedUrl,
  getAuthenticatedReportUser,
  getReportFrameR2Environment,
  getReportSupabaseEnvironment,
  getReportWorkerEnvironment,
  getWorkerJob,
  markReportFailed,
  persistCompletedWorkerResult,
  reportCorsHeaders,
  reportJson,
  workerStatusToReportStatus,
  type ReportPreviewFrame,
  type ReportRow,
  type WorkerFrame,
} from "../_shared/usability-reports.ts";

interface ReportStatusRequest {
  reportId?: string;
}

interface SourcePreviewRow {
  test_response_id: string;
  thumbnail_bucket: string | null;
  thumbnail_path: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
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

function statusResponse(
  report: Pick<ReportRow, "status" | "frame_count" | "error_message" | "completed_at">,
  previewFrames: ReportPreviewFrame[] = [],
  frameCountOverride?: number,
) {
  return reportJson({
    ok: true,
    status: report.status,
    frameCount: frameCountOverride ?? report.frame_count,
    errorMessage: report.error_message,
    completedAt: report.completed_at,
    previewFrames,
  });
}

async function loadSourcePreviewRows(
  admin: ReturnType<typeof createReportAdminClient>,
  reportId: string,
) {
  const { data, error } = await admin
    .from("usability_report_sources")
    .select("test_response_id, thumbnail_bucket, thumbnail_path, thumbnail_width, thumbnail_height")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SourcePreviewRow[];
}

async function signPreviewFrame(
  r2Env: ReturnType<typeof getReportFrameR2Environment>,
  frame: {
    id: string;
    testResponseId: string;
    source: "thumbnail" | "worker";
    bucket: string;
    key: string;
    width?: number | null;
    height?: number | null;
    timestampMs?: number | null;
    frameIndex?: number | null;
  },
): Promise<ReportPreviewFrame | null> {
  try {
    return {
      id: frame.id,
      testResponseId: frame.testResponseId,
      source: frame.source,
      url: await createReportFrameSignedUrl(r2Env, frame.bucket, frame.key),
      width: frame.width ?? null,
      height: frame.height ?? null,
      timestampMs: frame.timestampMs ?? null,
      frameIndex: frame.frameIndex ?? null,
    };
  } catch (_error) {
    return null;
  }
}

async function buildPreviewFrames(
  admin: ReturnType<typeof createReportAdminClient>,
  reportId: string,
  partialFrames: WorkerFrame[],
) {
  const sources = await loadSourcePreviewRows(admin, reportId);
  const thumbnailCandidates = sources
    .filter((source) => source.thumbnail_bucket && source.thumbnail_path)
    .slice(0, 5)
    .map((source) => ({
      id: `thumbnail:${source.test_response_id}`,
      testResponseId: source.test_response_id,
      source: "thumbnail" as const,
      bucket: source.thumbnail_bucket!,
      key: source.thumbnail_path!,
      width: source.thumbnail_width,
      height: source.thumbnail_height,
      timestampMs: 0,
      frameIndex: null,
    }));
  const workerCandidates = partialFrames.slice(-10).map((frame) => ({
    id: `worker:${frame.responseId}:${frame.frameIndex}:${frame.storageKey}`,
    testResponseId: frame.responseId,
    source: "worker" as const,
    bucket: frame.storageBucket,
    key: frame.storageKey,
    width: frame.width ?? null,
    height: frame.height ?? null,
    timestampMs: frame.timestampMs,
    frameIndex: frame.frameIndex,
  }));
  const candidates = [...thumbnailCandidates, ...workerCandidates].slice(0, 12);

  if (candidates.length === 0) {
    return [];
  }

  let r2Env: ReturnType<typeof getReportFrameR2Environment>;

  try {
    r2Env = getReportFrameR2Environment();
  } catch (_error) {
    return [];
  }

  const signed = await Promise.all(candidates.map((candidate) => signPreviewFrame(r2Env, candidate)));
  return signed.filter((frame): frame is ReportPreviewFrame => Boolean(frame?.url));
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
    const partialFrames = workerJob.result?.frames ?? workerJob.partialFrames ?? [];
    const previewFrames = await buildPreviewFrames(admin, report.id, partialFrames);
    const frameCount = Math.max(updatedReport.frame_count, partialFrames.length);
    return statusResponse(updatedReport, previewFrames, frameCount);
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "The report status could not be loaded.",
    }, 502);
  }
});
