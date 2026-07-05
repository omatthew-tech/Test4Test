import { analyzeReportQuotes } from "../_shared/quote-analysis.ts";
import {
  createReportAdminClient,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  reportCorsHeaders,
  reportJson,
} from "../_shared/usability-reports.ts";

interface AnalyzeQuoteRequest {
  reportId?: string;
  force?: boolean;
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

  const payload = (await request.json().catch(() => ({}))) as AnalyzeQuoteRequest;
  const reportId = payload.reportId?.trim() ?? "";

  if (!reportId) {
    return reportJson({ error: "Missing report id." }, 400);
  }

  const { data: reportRow, error: reportError } = await admin
    .from("usability_reports")
    .select("id, owner_user_id")
    .eq("id", reportId)
    .eq("owner_user_id", user.id)
    .single();

  if (reportError || !reportRow) {
    return reportJson({ error: reportError?.message ?? "Report not found." }, 404);
  }

  try {
    const quoteAnalysis = await analyzeReportQuotes(admin, reportId, {
      force: payload.force === true,
    });

    return reportJson({
      ok: true,
      quoteAnalysis,
    });
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "Quote analysis failed.",
    }, 500);
  }
});
