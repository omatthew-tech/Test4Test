import {
  createReportAdminClient,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  getReportWorkerEnvironment,
  getUsabilityReportAccess,
  reportCorsHeaders,
  reportJson,
  signWorkerFrameUrls,
} from "../_shared/usability-reports.ts";

interface GetReportFrameRequest {
  reportId?: string;
  frameId?: string;
}

interface FrameRow {
  id: string;
  report_id: string;
  storage_bucket: string;
  storage_key: string;
}

interface ReportOwnerRow {
  owner_user_id: string;
}

async function responseFromAuthError(error: unknown) {
  if (error instanceof Response) {
    const payload = await error.json().catch(() => ({ error: "Unauthorized." }));
    return reportJson(payload, error.status);
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: reportCorsHeaders });
  }

  if (request.method !== "POST") {
    return reportJson({ error: "Method not allowed." }, 405);
  }

  let supabaseEnv;

  try {
    supabaseEnv = getReportSupabaseEnvironment();
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "AI Analysis setup is incomplete.",
    }, 500);
  }

  const admin = createReportAdminClient(supabaseEnv);
  let user;

  try {
    user = await getAuthenticatedReportUser(admin, request);
  } catch (error) {
    const authResponse = await responseFromAuthError(error);
    return authResponse ?? reportJson({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as GetReportFrameRequest;
  const reportId = payload.reportId?.trim() ?? "";
  const frameId = payload.frameId?.trim() ?? "";

  if (!reportId || !frameId) {
    return reportJson({ error: "Missing report or frame id." }, 400);
  }

  const [{ data: frameData, error: frameError }, { data: reportData, error: reportError }] =
    await Promise.all([
      admin
        .from("usability_report_frames")
        .select("id, report_id, storage_bucket, storage_key")
        .eq("id", frameId)
        .eq("report_id", reportId)
        .maybeSingle(),
      admin
        .from("usability_reports")
        .select("owner_user_id")
        .eq("id", reportId)
        .maybeSingle(),
    ]);

  if (frameError || reportError || !frameData || !reportData) {
    return reportJson({ error: frameError?.message ?? reportError?.message ?? "Frame not found." }, 404);
  }

  const frame = frameData as FrameRow;
  const report = reportData as ReportOwnerRow;
  let access;

  try {
    access = await getUsabilityReportAccess(
      admin,
      reportId,
      report.owner_user_id,
      user,
    );
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "Report access could not be checked.",
    }, 500);
  }

  if (!access) {
    return reportJson({ error: "Frame not found." }, 404);
  }

  let signedUrl;

  try {
    const signedUrls = await signWorkerFrameUrls(
      getReportWorkerEnvironment(),
      [{
        id: frame.id,
        bucket: frame.storage_bucket,
        key: frame.storage_key,
      }],
    );
    signedUrl = signedUrls.get(frame.id);

    if (!signedUrl) {
      throw new Error("The video processor did not return a screenshot URL.");
    }
  } catch (error) {
    console.error("Unable to sign a report frame for PDF preview.", {
      reportId,
      frameId,
      message: error instanceof Error ? error.message : "Unknown signing error.",
    });
    return reportJson({
      error: error instanceof Error ? error.message : "The screenshot could not be accessed.",
    }, 500);
  }

  let frameResponse: Response;

  try {
    frameResponse = await fetch(signedUrl);
  } catch (error) {
    console.error("Unable to reach a signed report frame for PDF preview.", {
      reportId,
      frameId,
      message: error instanceof Error ? error.message : "Unknown upstream error.",
    });
    return reportJson({ error: "The screenshot service could not be reached." }, 502);
  }

  if (!frameResponse.ok || !frameResponse.body) {
    console.error("A signed report frame failed to load for PDF preview.", {
      reportId,
      frameId,
      status: frameResponse.status,
      contentType: frameResponse.headers.get("Content-Type"),
    });
    return reportJson({ error: "The screenshot could not be loaded." }, 502);
  }

  return new Response(frameResponse.body, {
    status: 200,
    headers: {
      ...reportCorsHeaders,
      "Content-Type": frameResponse.headers.get("Content-Type") || "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
