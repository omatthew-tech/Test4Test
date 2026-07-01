import {
  createReportAdminClient,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  getReportWorkerEnvironment,
  mapReportSummary,
  reportCorsHeaders,
  reportJson,
  signWorkerFrameUrls,
  type ReportRow,
} from "../_shared/usability-reports.ts";

interface GetReportRequest {
  reportId?: string;
}

interface FrameRow {
  id: string;
  report_id: string;
  test_response_id: string;
  frame_index: number;
  timestamp_ms: number;
  storage_bucket: string;
  storage_key: string;
  width: number | null;
  height: number | null;
  test_responses?: { anonymous_label?: string | null } | Array<{ anonymous_label?: string | null }> | null;
}

interface QuoteRow {
  id: string;
  report_id: string;
  test_response_id: string;
  frame_id: string | null;
  transcript_segment_id: string | null;
  timestamp_ms: number;
  start_ms: number | null;
  end_ms: number | null;
  quote_text: string;
  speaker: string | null;
  include_in_summary: boolean;
  test_responses?: { anonymous_label?: string | null } | Array<{ anonymous_label?: string | null }> | null;
}

async function responseFromAuthError(error: unknown) {
  if (error instanceof Response) {
    const payload = await error.json().catch(() => ({ error: "Unauthorized." }));
    return reportJson(payload, error.status);
  }

  return null;
}

function getTesterLabel(row: Pick<FrameRow | QuoteRow, "test_responses">) {
  const response = Array.isArray(row.test_responses)
    ? row.test_responses[0]
    : row.test_responses;

  return response?.anonymous_label?.trim() || "Tester";
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

  const payload = (await request.json().catch(() => ({}))) as GetReportRequest;
  const reportId = payload.reportId?.trim() ?? "";

  if (!reportId) {
    return reportJson({ error: "Missing report id." }, 400);
  }

  const { data: reportData, error: reportError } = await admin
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
    .eq("id", reportId)
    .eq("owner_user_id", user.id)
    .single();

  if (reportError || !reportData) {
    return reportJson({ error: reportError?.message ?? "Report not found." }, 404);
  }

  const { data: frameRows, error: frameError } = await admin
    .from("usability_report_frames")
    .select(`
      id,
      report_id,
      test_response_id,
      frame_index,
      timestamp_ms,
      storage_bucket,
      storage_key,
      width,
      height,
      test_responses (
        anonymous_label
      )
    `)
    .eq("report_id", reportId)
    .order("test_response_id", { ascending: true })
    .order("frame_index", { ascending: true });

  if (frameError) {
    return reportJson({ error: frameError.message }, 500);
  }

  const rows = (frameRows ?? []) as FrameRow[];
  let signedUrls = new Map<string, string>();

  try {
    const workerEnv = getReportWorkerEnvironment();
    signedUrls = await signWorkerFrameUrls(
      workerEnv,
      rows.map((frame) => ({
        id: frame.id,
        bucket: frame.storage_bucket,
        key: frame.storage_key,
      })),
    );
  } catch (_error) {
    signedUrls = new Map<string, string>();
  }

  const frames = rows.map((frame) => ({
    id: frame.id,
    reportId: frame.report_id,
    testResponseId: frame.test_response_id,
    testerLabel: getTesterLabel(frame),
    frameIndex: frame.frame_index,
    timestampMs: frame.timestamp_ms,
    url: signedUrls.get(frame.id) ?? "",
    width: frame.width,
    height: frame.height,
  }));

  const { data: quoteRows, error: quoteError } = await admin
    .from("usability_report_quotes")
    .select(`
      id,
      report_id,
      test_response_id,
      frame_id,
      transcript_segment_id,
      timestamp_ms,
      start_ms,
      end_ms,
      quote_text,
      speaker,
      include_in_summary,
      test_responses (
        anonymous_label
      )
    `)
    .eq("report_id", reportId)
    .order("test_response_id", { ascending: true })
    .order("timestamp_ms", { ascending: true });

  if (quoteError) {
    return reportJson({ error: quoteError.message }, 500);
  }

  const quotes = ((quoteRows ?? []) as QuoteRow[]).map((quote) => ({
    id: quote.id,
    reportId: quote.report_id,
    testResponseId: quote.test_response_id,
    testerLabel: getTesterLabel(quote),
    timestampMs: quote.timestamp_ms,
    startMs: quote.start_ms,
    endMs: quote.end_ms,
    text: quote.quote_text,
    speaker: quote.speaker,
    transcriptSegmentId: quote.transcript_segment_id,
    includeInSummary: quote.include_in_summary !== false,
    linkedFrameId: quote.frame_id,
    linkedFrameUrl: quote.frame_id ? signedUrls.get(quote.frame_id) ?? null : null,
  }));

  return reportJson({
    ok: true,
    report: {
      ...mapReportSummary(reportData as ReportRow),
      frames,
      quotes,
    },
  });
});
