import {
  createReportAdminClient,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  mapReportSummary,
  reportCorsHeaders,
  reportJson,
  type ReportRow,
} from "../_shared/usability-reports.ts";

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

  const { data, error } = await admin
    .from("usability_reports")
    .select(`
      id,
      submission_id,
      owner_user_id,
      report_number,
      status,
      error_message,
      source_response_count,
      frame_count,
      created_at,
      completed_at,
      submissions (
        product_name
      )
    `)
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return reportJson({ error: error.message }, 500);
  }

  return reportJson({
    ok: true,
    reports: ((data ?? []) as ReportRow[]).map(mapReportSummary),
  });
});
