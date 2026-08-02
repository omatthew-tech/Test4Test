import { analyzeReportQuotes } from "../_shared/quote-analysis.ts";
import {
  createReportAdminClient,
  createReportRow,
  getAuthenticatedReportUser,
  getUsabilityReportAccess,
  getReportSupabaseEnvironment,
  markReportFailed,
  reportCorsHeaders,
  reportJson,
  sendReportReadyNotification,
} from "../_shared/usability-reports.ts";

interface RegenerateReportRequest {
  reportId?: unknown;
  reportName?: unknown;
}

interface SourceReportRow {
  id: string;
  submission_id: string;
  owner_user_id: string;
  status: "pending" | "processing" | "completed" | "failed";
}

interface ReportSourceRow {
  test_response_id: string;
  recording_bucket: string;
  recording_path: string;
  thumbnail_bucket: string | null;
  thumbnail_path: string | null;
  thumbnail_content_type: string | null;
  thumbnail_size_bytes: number | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
}

interface ReportFrameRow {
  id: string;
  test_response_id: string;
  frame_index: number;
  timestamp_ms: number;
  storage_bucket: string;
  storage_key: string;
  width: number | null;
  height: number | null;
  content_type: string;
  size_bytes: number | null;
  perceptual_hash: string | null;
}

interface ReportQuoteRow {
  test_response_id: string;
  frame_id: string | null;
  transcript_segment_id: string | null;
  timestamp_ms: number;
  start_ms: number | null;
  end_ms: number | null;
  quote_text: string;
  speaker: string | null;
  include_in_summary: boolean;
}

interface ReportShareRow {
  owner_user_id: string;
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_email: string;
  status: "sent" | "opened";
  invited_at: string;
  sent_at: string | null;
  opened_at: string | null;
}

async function responseFromAuthError(error: unknown) {
  if (error instanceof Response) {
    const payload = await error.json().catch(() => ({ error: "Unauthorized." }));
    return reportJson(payload, error.status);
  }

  return null;
}

async function insertInBatches(
  admin: ReturnType<typeof createReportAdminClient>,
  table: string,
  rows: Array<Record<string, unknown>>,
) {
  const batchSize = 250;

  for (let index = 0; index < rows.length; index += batchSize) {
    const { error } = await admin
      .from(table)
      .insert(rows.slice(index, index + batchSize));

    if (error) {
      throw new Error(error.message);
    }
  }
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

  const payload = (await request.json().catch(() => ({}))) as RegenerateReportRequest;
  const sourceReportId = typeof payload.reportId === "string" ? payload.reportId.trim() : "";
  const requestedReportName =
    typeof payload.reportName === "string" ? payload.reportName.trim() : null;

  if (!sourceReportId) {
    return reportJson({ error: "Missing report id." }, 400);
  }

  if (payload.reportName !== undefined && !requestedReportName) {
    return reportJson({ error: "Enter a report name." }, 400);
  }

  if (requestedReportName && requestedReportName.length > 100) {
    return reportJson({ error: "Report names must be 100 characters or fewer." }, 400);
  }

  const { data: sourceReportData, error: sourceReportError } = await admin
    .from("usability_reports")
    .select("id, submission_id, owner_user_id, status")
    .eq("id", sourceReportId)
    .maybeSingle();

  if (sourceReportError) {
    return reportJson({ error: sourceReportError.message }, 500);
  }

  if (!sourceReportData) {
    return reportJson({ error: "Report not found." }, 404);
  }

  const sourceReport = sourceReportData as SourceReportRow;

  let access;

  try {
    access = await getUsabilityReportAccess(
      admin,
      sourceReport.id,
      sourceReport.owner_user_id,
      user,
    );
  } catch (error) {
    return reportJson({
      error: error instanceof Error ? error.message : "Report access could not be checked.",
    }, 500);
  }

  if (!access) {
    return reportJson({ error: "Report not found." }, 404);
  }

  if (sourceReport.status !== "completed") {
    return reportJson({ error: "Only completed reports can be regenerated." }, 409);
  }

  const [sourcesResult, framesResult, quotesResult, sharesResult] = await Promise.all([
    admin
      .from("usability_report_sources")
      .select(`
        test_response_id,
        recording_bucket,
        recording_path,
        thumbnail_bucket,
        thumbnail_path,
        thumbnail_content_type,
        thumbnail_size_bytes,
        thumbnail_width,
        thumbnail_height
      `)
      .eq("report_id", sourceReportId),
    admin
      .from("usability_report_frames")
      .select(`
        id,
        test_response_id,
        frame_index,
        timestamp_ms,
        storage_bucket,
        storage_key,
        width,
        height,
        content_type,
        size_bytes,
        perceptual_hash
      `)
      .eq("report_id", sourceReportId)
      .order("test_response_id", { ascending: true })
      .order("frame_index", { ascending: true }),
    admin
      .from("usability_report_quotes")
      .select(`
        test_response_id,
        frame_id,
        transcript_segment_id,
        timestamp_ms,
        start_ms,
        end_ms,
        quote_text,
        speaker,
        include_in_summary
      `)
      .eq("report_id", sourceReportId)
      .order("test_response_id", { ascending: true })
      .order("timestamp_ms", { ascending: true }),
    admin
      .from("usability_report_shares")
      .select(`
        owner_user_id,
        recipient_user_id,
        recipient_name,
        recipient_email,
        status,
        invited_at,
        sent_at,
        opened_at
      `)
      .eq("report_id", sourceReportId)
      .in("status", ["sent", "opened"]),
  ]);

  if (sourcesResult.error || framesResult.error || quotesResult.error || sharesResult.error) {
    return reportJson({
      error:
        sourcesResult.error?.message ??
        framesResult.error?.message ??
        quotesResult.error?.message ??
        sharesResult.error?.message ??
        "The source report could not be loaded.",
    }, 500);
  }

  const sources = (sourcesResult.data ?? []) as ReportSourceRow[];
  const frames = (framesResult.data ?? []) as ReportFrameRow[];
  const quotes = (quotesResult.data ?? []) as ReportQuoteRow[];
  const shares = (sharesResult.data ?? []) as ReportShareRow[];
  const includedQuoteCount = quotes.filter((quote) => quote.include_in_summary !== false).length;

  if (sources.length === 0 || frames.length === 0) {
    return reportJson({ error: "The source report does not contain reusable report data." }, 400);
  }

  if (includedQuoteCount === 0) {
    return reportJson({
      error: "Restore at least one feedback item before generating a new report.",
    }, 400);
  }

  let newReportId = "";

  try {
    const newReport = await createReportRow(
      admin,
      sourceReport.submission_id,
      sourceReport.owner_user_id,
      sources.length,
      requestedReportName,
    );
    newReportId = newReport.id;

    await insertInBatches(
      admin,
      "usability_report_sources",
      sources.map((source) => ({
        report_id: newReport.id,
        test_response_id: source.test_response_id,
        recording_bucket: source.recording_bucket,
        recording_path: source.recording_path,
        thumbnail_bucket: source.thumbnail_bucket,
        thumbnail_path: source.thumbnail_path,
        thumbnail_content_type: source.thumbnail_content_type,
        thumbnail_size_bytes: source.thumbnail_size_bytes,
        thumbnail_width: source.thumbnail_width,
        thumbnail_height: source.thumbnail_height,
      })),
    );

    const frameIdMap = new Map<string, string>();
    const newFrames = frames.map((frame) => {
      const id = crypto.randomUUID();
      frameIdMap.set(frame.id, id);

      return {
        id,
        report_id: newReport.id,
        test_response_id: frame.test_response_id,
        frame_index: frame.frame_index,
        timestamp_ms: frame.timestamp_ms,
        storage_bucket: frame.storage_bucket,
        storage_key: frame.storage_key,
        width: frame.width,
        height: frame.height,
        content_type: frame.content_type,
        size_bytes: frame.size_bytes,
        perceptual_hash: frame.perceptual_hash,
      };
    });

    await insertInBatches(admin, "usability_report_frames", newFrames);
    await insertInBatches(
      admin,
      "usability_report_quotes",
      quotes.map((quote) => ({
        report_id: newReport.id,
        test_response_id: quote.test_response_id,
        frame_id: quote.frame_id ? frameIdMap.get(quote.frame_id) ?? null : null,
        transcript_segment_id: quote.transcript_segment_id,
        timestamp_ms: quote.timestamp_ms,
        start_ms: quote.start_ms,
        end_ms: quote.end_ms,
        quote_text: quote.quote_text,
        speaker: quote.speaker,
        include_in_summary: quote.include_in_summary !== false,
      })),
    );

    if (shares.length > 0) {
      await insertInBatches(
        admin,
        "usability_report_shares",
        shares.map((share) => ({
          report_id: newReport.id,
          owner_user_id: share.owner_user_id,
          recipient_user_id: share.recipient_user_id,
          recipient_name: share.recipient_name,
          recipient_email: share.recipient_email,
          status: share.status,
          invited_at: share.invited_at,
          sent_at: share.sent_at,
          opened_at: share.opened_at,
        })),
      );
    }

    const { error: processingError } = await admin
      .from("usability_reports")
      .update({
        status: "processing",
        frame_count: frames.length,
        source_response_count: sources.length,
        error_message: null,
      })
      .eq("id", newReport.id);

    if (processingError) {
      throw new Error(processingError.message);
    }

    await analyzeReportQuotes(admin, newReport.id, { force: true });

    const completedAt = new Date().toISOString();
    const { error: completedError } = await admin
      .from("usability_reports")
      .update({
        status: "completed",
        frame_count: frames.length,
        source_response_count: sources.length,
        error_message: null,
        completed_at: completedAt,
      })
      .eq("id", newReport.id);

    if (completedError) {
      throw new Error(completedError.message);
    }

    await sendReportReadyNotification(admin, {
      reportId: newReport.id,
      submissionId: sourceReport.submission_id,
      ownerUserId: sourceReport.owner_user_id,
      frameCount: frames.length,
    }).catch((error) => {
      console.error("Failed to send regenerated report notification", {
        reportId: newReport.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return reportJson({
      ok: true,
      reportId: newReport.id,
      reportNumber: newReport.report_number,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The updated report could not be generated.";

    if (newReportId) {
      await markReportFailed(admin, newReportId, message).catch(() => undefined);
    }

    return reportJson({ error: message }, 500);
  }
});
