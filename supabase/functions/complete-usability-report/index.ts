import {
  createReportAdminClient,
  getReportSupabaseEnvironment,
  markReportFailed,
  persistCompletedWorkerResult,
  reportCorsHeaders,
  reportJson,
  type WorkerResult,
} from "../_shared/usability-reports.ts";

interface CompleteReportPayload extends Partial<WorkerResult> {
  status?: "completed" | "failed";
  error?: string;
}

function getWorkerSecret() {
  return Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim() ?? "";
}

function isAuthorized(request: Request) {
  const expectedSecret = getWorkerSecret();
  const providedSecret = request.headers.get("x-worker-secret")?.trim() ?? "";

  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: reportCorsHeaders });
  }

  if (request.method !== "POST") {
    return reportJson({ error: "Method not allowed." }, 405);
  }

  if (!isAuthorized(request)) {
    return reportJson({ error: "Unauthorized." }, 401);
  }

  let env;

  try {
    env = getReportSupabaseEnvironment();
  } catch (error) {
    return reportJson({ error: error instanceof Error ? error.message : "AI Analysis setup is incomplete." }, 500);
  }

  const payload = (await request.json().catch(() => ({}))) as CompleteReportPayload;
  const reportId = payload.reportId?.trim() ?? "";

  if (!reportId) {
    return reportJson({ error: "Missing report id." }, 400);
  }

  const admin = createReportAdminClient(env);

  try {
    if (payload.status === "failed") {
      await markReportFailed(admin, reportId, payload.error ?? "The video processor could not finish this report.");
      return reportJson({ ok: true });
    }

    if (payload.status !== "completed" || !Array.isArray(payload.frames)) {
      return reportJson({ error: "Invalid completion payload." }, 400);
    }

    await persistCompletedWorkerResult(admin, reportId, {
      reportId,
      sourceCount: payload.sourceCount ?? 0,
      frameCount: payload.frameCount ?? payload.frames.length,
      frames: payload.frames,
      manifestKey: payload.manifestKey,
    });

    return reportJson({ ok: true });
  } catch (error) {
    return reportJson({ error: error instanceof Error ? error.message : "Report completion could not be saved." }, 500);
  }
});
