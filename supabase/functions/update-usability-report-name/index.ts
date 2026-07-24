import {
  createReportAdminClient,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  reportCorsHeaders,
  reportJson,
} from "../_shared/usability-reports.ts";

interface UpdateReportNameRequest {
  reportId?: unknown;
  reportName?: unknown;
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

  let env;

  try {
    env = getReportSupabaseEnvironment();
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "AI Analysis setup is incomplete.",
    }, 500);
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

  const payload = (await request.json().catch(() => ({}))) as UpdateReportNameRequest;
  const reportId = typeof payload.reportId === "string" ? payload.reportId.trim() : "";
  const reportName = typeof payload.reportName === "string" ? payload.reportName.trim() : "";

  if (!reportId) {
    return reportJson({ error: "Missing report id." }, 400);
  }

  if (!reportName) {
    return reportJson({ error: "Enter a report name." }, 400);
  }

  if (reportName.length > 100) {
    return reportJson({ error: "Report names must be 100 characters or fewer." }, 400);
  }

  const { data, error } = await admin
    .from("usability_reports")
    .update({ report_name: reportName })
    .eq("id", reportId)
    .eq("owner_user_id", user.id)
    .select("id, report_name")
    .maybeSingle();

  if (error) {
    return reportJson({ error: error.message }, 500);
  }

  if (!data) {
    return reportJson({ error: "Report not found." }, 404);
  }

  return reportJson({
    ok: true,
    reportId: data.id,
    reportName: data.report_name,
  });
});
