import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { analyzeReportQuotes } from "./quote-analysis.ts";
import {
  getEmailEnvironment,
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
} from "./email-system.ts";
import {
  groupTranscriptFramesByResponse,
  matchTranscriptSegmentToFrame,
  type TranscriptFrameWindow,
} from "./transcript-frame-matching.ts";

export const NO_RECORDINGS_ERROR = "no_recordings";

export const reportReadyTemplateKey = "usability_report_ready";

export const reportCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function reportJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...reportCorsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export interface ReportSupabaseEnvironment {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface ReportWorkerEnvironment {
  workerUrl: string;
  workerSecret: string;
}

export interface ReportFrameR2Environment {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

export interface WorkerSource {
  responseId: string;
  objectKey?: string;
  url?: string;
  bucket?: string;
  transcriptCached?: boolean;
}

export interface WorkerFrame {
  responseId: string;
  frameIndex: number;
  timestampMs: number;
  storageBucket: string;
  storageKey: string;
  width?: number;
  height?: number;
  contentType?: string;
  sizeBytes?: number;
  perceptualHash?: string;
}

export interface WorkerTranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface WorkerTranscriptSegment {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  words?: WorkerTranscriptWord[];
  avgLogprob?: number | null;
  noSpeechProb?: number | null;
  compressionRatio?: number | null;
}

export interface WorkerTranscript {
  responseId: string;
  provider: string;
  model: string;
  language?: string | null;
  durationMs?: number | null;
  fullText: string;
  segments: WorkerTranscriptSegment[];
}

export interface WorkerResult {
  reportId: string;
  frameCount: number;
  sourceCount: number;
  frames: WorkerFrame[];
  transcripts?: WorkerTranscript[];
  manifestKey?: string;
}

export interface ReportPreviewFrame {
  id: string;
  testResponseId: string;
  source: "thumbnail" | "worker";
  url: string;
  width?: number | null;
  height?: number | null;
  timestampMs?: number | null;
  frameIndex?: number | null;
}

export interface WorkerJob {
  id: string;
  reportId: string;
  status: "queued" | "processing" | "completed" | "failed";
  partialFrames?: WorkerFrame[];
  result?: WorkerResult;
  error?: string;
}

export interface WorkerFrameSignRequest {
  id: string;
  bucket: string;
  key: string;
}

export interface ReportRow {
  id: string;
  submission_id: string;
  owner_user_id: string;
  report_number: number;
  report_name?: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  source_response_count: number;
  frame_count: number;
  created_at: string;
  completed_at: string | null;
  worker_job_id?: string | null;
  submissions?: { product_name?: string | null } | Array<{ product_name?: string | null }> | null;
}

interface TranscriptRow {
  id: string;
  test_response_id: string;
}

interface TranscriptSegmentRow {
  id: string;
  transcript_id: string;
  test_response_id: string;
  segment_index: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

const REPORT_TRANSCRIPTION_PROVIDER = "groq";
const DEFAULT_REPORT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

export function getReportSupabaseEnvironment(): ReportSupabaseEnvironment {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server secrets for AI Analysis reports.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
  };
}

export function getReportWorkerEnvironment(): ReportWorkerEnvironment {
  const workerUrl = (Deno.env.get("VIDEO_PROCESSOR_URL")?.trim() ?? "").replace(/\/+$/, "");
  const workerSecret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim() ?? "";

  if (!workerUrl || !workerSecret) {
    throw new Error("Missing video processor secrets for AI Analysis reports.");
  }

  return {
    workerUrl,
    workerSecret,
  };
}

export function getReportTranscriptionModel() {
  return Deno.env.get("GROQ_TRANSCRIPTION_MODEL")?.trim() || DEFAULT_REPORT_TRANSCRIPTION_MODEL;
}

export function getReportFrameR2Environment(): ReportFrameR2Environment {
  const accountId = Deno.env.get("R2_ACCOUNT_ID")?.trim() ?? "";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")?.trim() ?? "";
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")?.trim() ?? "";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 secrets for AI Analysis report frames.");
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

export function createReportAdminClient(env: ReportSupabaseEnvironment) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function getAuthenticatedReportUser(admin: SupabaseClient, request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    throw new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user) {
    throw new Response(JSON.stringify({ error: error?.message ?? "Unauthorized." }), { status: 401 });
  }

  return user;
}

function getSubmissionProductName(report: ReportRow) {
  const submission = Array.isArray(report.submissions)
    ? report.submissions[0]
    : report.submissions;

  return submission?.product_name?.trim() || "Untitled app";
}

export function mapReportSummary(report: ReportRow) {
  return {
    id: report.id,
    submissionId: report.submission_id,
    submissionProductName: getSubmissionProductName(report),
    reportNumber: report.report_number,
    reportName: report.report_name?.trim() || `Report ${report.report_number}`,
    status: report.status,
    errorMessage: report.error_message,
    sourceResponseCount: report.source_response_count,
    frameCount: report.frame_count,
    createdAt: report.created_at,
    completedAt: report.completed_at,
  };
}

export async function createReportRow(
  admin: SupabaseClient,
  submissionId: string,
  ownerUserId: string,
  sourceResponseCount: number,
  requestedReportName: string | null = null,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: latestRows, error: latestError } = await admin
      .from("usability_reports")
      .select("report_number")
      .eq("submission_id", submissionId)
      .order("report_number", { ascending: false })
      .limit(1);

    if (latestError) {
      throw new Error(latestError.message);
    }

    const latestNumber = Number(
      (latestRows?.[0] as { report_number?: number } | undefined)?.report_number ?? 0,
    );
    const reportNumber = latestNumber + 1;
    const { data, error } = await admin
      .from("usability_reports")
      .insert({
        submission_id: submissionId,
        owner_user_id: ownerUserId,
        report_number: reportNumber,
        report_name: requestedReportName ?? `Report ${reportNumber}`,
        status: "pending",
        source_response_count: sourceResponseCount,
      })
      .select("id, report_number")
      .single();

    if (!error && data) {
      return data as { id: string; report_number: number };
    }

    if ((error as { code?: string } | null)?.code === "23505") {
      continue;
    }

    throw new Error(error?.message ?? "The report could not be created.");
  }

  throw new Error("The report number could not be reserved. Please try again.");
}

export function workerStatusToReportStatus(status: WorkerJob["status"]) {
  if (status === "queued") {
    return "pending" as const;
  }

  return status;
}

function buildWorkerHeaders(env: ReportWorkerEnvironment) {
  return {
    "Content-Type": "application/json",
    ...(env.workerSecret ? { "x-worker-secret": env.workerSecret } : {}),
  };
}

export async function enqueueWorkerReport(
  env: ReportWorkerEnvironment,
  reportId: string,
  sources: WorkerSource[],
) {
  const response = await fetch(`${env.workerUrl}/reports/process`, {
    method: "POST",
    headers: buildWorkerHeaders(env),
    body: JSON.stringify({ reportId, sources }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    jobId?: string;
    status?: WorkerJob["status"];
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || !payload?.ok || !payload.jobId) {
    throw new Error(payload?.error ?? payload?.message ?? "The video processor could not start this report.");
  }

  return {
    jobId: payload.jobId,
    status: payload.status ?? "queued",
  };
}

export async function loadCompletedTranscriptResponseIds(
  admin: SupabaseClient,
  responseIds: string[],
  model = getReportTranscriptionModel(),
) {
  if (responseIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await admin
    .from("test_response_transcripts")
    .select("test_response_id")
    .eq("provider", REPORT_TRANSCRIPTION_PROVIDER)
    .eq("model", model)
    .eq("status", "completed")
    .in("test_response_id", responseIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => String((row as { test_response_id: string }).test_response_id)));
}

export async function getWorkerJob(env: ReportWorkerEnvironment, jobId: string) {
  const response = await fetch(`${env.workerUrl}/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: buildWorkerHeaders(env),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    job?: WorkerJob;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || !payload?.ok || !payload.job) {
    throw new Error(payload?.error ?? payload?.message ?? "The video processor job could not be loaded.");
  }

  return payload.job;
}

export async function signWorkerFrameUrls(
  env: ReportWorkerEnvironment,
  frames: WorkerFrameSignRequest[],
) {
  if (frames.length === 0) {
    return new Map<string, string>();
  }

  const response = await fetch(`${env.workerUrl}/frames/sign`, {
    method: "POST",
    headers: buildWorkerHeaders(env),
    body: JSON.stringify({ frames }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    frames?: Array<{ id?: string; url?: string }>;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || !payload?.ok || !Array.isArray(payload.frames)) {
    throw new Error(payload?.error ?? payload?.message ?? "The video processor could not sign preview frames.");
  }

  const urls = new Map<string, string>();

  for (const frame of payload.frames) {
    if (frame.id && frame.url) {
      urls.set(frame.id, frame.url);
    }
  }

  return urls;
}

export async function persistCompletedWorkerResult(
  admin: SupabaseClient,
  reportId: string,
  result: WorkerResult,
) {
  const frames = result.frames.map((frame) => ({
    report_id: reportId,
    test_response_id: frame.responseId,
    frame_index: frame.frameIndex,
    timestamp_ms: frame.timestampMs,
    storage_bucket: frame.storageBucket,
    storage_key: frame.storageKey,
    width: frame.width ?? null,
    height: frame.height ?? null,
    content_type: frame.contentType ?? "image/webp",
    size_bytes: frame.sizeBytes ?? null,
    perceptual_hash: frame.perceptualHash ?? null,
  }));

  if (frames.length > 0) {
    const { error: frameError } = await admin
      .from("usability_report_frames")
      .upsert(frames, { onConflict: "report_id,test_response_id,frame_index" });

    if (frameError) {
      throw new Error(frameError.message);
    }
  }

  // Guard on the current status so the transition to "completed" only happens
  // once, even if this runs from both the polling path and the worker webhook.
  // Only a row that actually flipped is returned, which is our "fire once" signal.
  const quoteModel = result.transcripts?.find((transcript) => transcript.model.trim())?.model ??
    getReportTranscriptionModel();

  await persistWorkerTranscripts(admin, result.transcripts ?? []);
  await createReportQuotesFromTranscripts(admin, reportId, quoteModel);

  // Guard on the current status so the transition to "completed" only happens
  // once, even if this runs from both the polling path and the worker webhook.
  // Only a row that actually flipped is returned, which is our "fire once" signal.
  const { data: transitionedRows, error: updateError } = await admin
    .from("usability_reports")
    .update({
      status: "completed",
      source_response_count: result.sourceCount,
      frame_count: result.frameCount,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .neq("status", "completed")
    .select("id, submission_id, owner_user_id, frame_count");

  if (updateError) {
    throw new Error(updateError.message);
  }

  const transitioned = (transitionedRows ?? [])[0] as
    | { id: string; submission_id: string; owner_user_id: string; frame_count: number }
    | undefined;

  if (transitioned) {
    await analyzeReportQuotes(admin, transitioned.id).catch((error) => {
      console.error("Failed to analyze report quotes", {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // The report is what matters; a notification failure must never fail completion.
    await sendReportReadyNotification(admin, {
      reportId: transitioned.id,
      submissionId: transitioned.submission_id,
      ownerUserId: transitioned.owner_user_id,
      frameCount: transitioned.frame_count ?? result.frameCount,
    }).catch((error) => {
      console.error("Failed to send report-ready notification", {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

interface ReportReadyContext {
  reportId: string;
  submissionId: string;
  ownerUserId: string;
  frameCount: number;
}

/**
 * Email the app owner that their usability report finished processing.
 * Loads its own email environment so report completion does not depend on SMTP
 * being configured; if secrets are missing this throws and the caller swallows it.
 */
export async function sendReportReadyNotification(
  admin: SupabaseClient,
  context: ReportReadyContext,
) {
  const env = getEmailEnvironment();

  const { data: ownerRow, error: ownerError } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", context.ownerUserId)
    .single();

  if (ownerError || !ownerRow) {
    throw new Error(ownerError?.message ?? "Report owner not found.");
  }

  const owner = ownerRow as { id: string; email: string; display_name: string };

  if (!owner.email?.trim()) {
    return;
  }

  const { data: submissionRow, error: submissionError } = await admin
    .from("submissions")
    .select("id, product_name")
    .eq("id", context.submissionId)
    .single();

  if (submissionError || !submissionRow) {
    throw new Error(submissionError?.message ?? "Report submission not found.");
  }

  const submission = submissionRow as { id: string; product_name: string | null };
  const productName = submission.product_name?.trim() || "your app";

  const templates = await loadEmailTemplates(admin, [reportReadyTemplateKey]);
  const template = templates.get(reportReadyTemplateKey);

  if (!template) {
    throw new Error(`Missing email template: ${reportReadyTemplateKey}`);
  }

  const reportUrl = `${env.appBaseUrl}/reports/${context.reportId}`;
  const rendered = renderEmailTemplate(template, {
    ownerDisplayName: owner.display_name?.trim() || "there",
    productName,
    reportUrl,
    frameCount: String(context.frameCount),
  });

  try {
    const sendResult = await sendEmail(env, {
      to: owner.email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });

    await logEmailDelivery(admin, {
      templateKey: reportReadyTemplateKey,
      recipientUserId: owner.id,
      recipientEmail: owner.email,
      relatedSubmissionId: submission.id,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: { reportId: context.reportId, frameCount: context.frameCount },
    });
  } catch (error) {
    await logEmailDelivery(admin, {
      templateKey: reportReadyTemplateKey,
      recipientUserId: owner.id,
      recipientEmail: owner.email,
      relatedSubmissionId: submission.id,
      subject: rendered.subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to send report-ready email.",
      metadata: { reportId: context.reportId, frameCount: context.frameCount },
    }).catch(() => undefined);

    throw error;
  }
}

async function persistWorkerTranscripts(
  admin: SupabaseClient,
  transcripts: WorkerTranscript[],
) {
  for (const transcript of transcripts) {
    const completedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("test_response_transcripts")
      .upsert(
        {
          test_response_id: transcript.responseId,
          provider: transcript.provider,
          model: transcript.model,
          status: "completed",
          language: transcript.language ?? null,
          duration_ms: transcript.durationMs ?? null,
          full_text: transcript.fullText ?? "",
          error_message: null,
          completed_at: completedAt,
          updated_at: completedAt,
        },
        { onConflict: "test_response_id,provider,model" },
      )
      .select("id, test_response_id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Transcript could not be saved.");
    }

    const transcriptRow = data as TranscriptRow;
    const segments = transcript.segments
      .filter((segment) => segment.text.trim())
      .map((segment) => {
        const startMs = Math.max(0, Math.round(segment.startMs));
        const endMs = Math.max(startMs, Math.round(segment.endMs));

        return {
          transcript_id: transcriptRow.id,
          test_response_id: transcript.responseId,
          segment_index: segment.segmentIndex,
          start_ms: startMs,
          end_ms: endMs,
          text: segment.text.trim(),
          words: segment.words ?? null,
          avg_logprob: segment.avgLogprob ?? null,
          no_speech_prob: segment.noSpeechProb ?? null,
          compression_ratio: segment.compressionRatio ?? null,
        };
      });

    if (segments.length === 0) {
      continue;
    }

    const { error: segmentError } = await admin
      .from("test_response_transcript_segments")
      .upsert(segments, { onConflict: "transcript_id,segment_index" });

    if (segmentError) {
      throw new Error(segmentError.message);
    }
  }
}

async function loadReportSourceResponseIds(admin: SupabaseClient, reportId: string) {
  const { data, error } = await admin
    .from("usability_report_sources")
    .select("test_response_id")
    .eq("report_id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => String((row as { test_response_id: string }).test_response_id));
}

async function loadCompletedTranscriptRows(
  admin: SupabaseClient,
  responseIds: string[],
  model = getReportTranscriptionModel(),
) {
  if (responseIds.length === 0) {
    return [] as TranscriptRow[];
  }

  const { data, error } = await admin
    .from("test_response_transcripts")
    .select("id, test_response_id")
    .eq("provider", REPORT_TRANSCRIPTION_PROVIDER)
    .eq("model", model)
    .eq("status", "completed")
    .in("test_response_id", responseIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TranscriptRow[];
}

async function loadTranscriptSegments(
  admin: SupabaseClient,
  transcriptIds: string[],
) {
  if (transcriptIds.length === 0) {
    return [] as TranscriptSegmentRow[];
  }

  const { data, error } = await admin
    .from("test_response_transcript_segments")
    .select("id, transcript_id, test_response_id, segment_index, start_ms, end_ms, text")
    .in("transcript_id", transcriptIds)
    .order("test_response_id", { ascending: true })
    .order("start_ms", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TranscriptSegmentRow[];
}

async function loadReportFramesForQuotes(admin: SupabaseClient, reportId: string) {
  const { data, error } = await admin
    .from("usability_report_frames")
    .select("id, test_response_id, frame_index, timestamp_ms")
    .eq("report_id", reportId)
    .order("test_response_id", { ascending: true })
    .order("frame_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TranscriptFrameWindow[];
}

async function createReportQuotesFromTranscripts(admin: SupabaseClient, reportId: string, model: string) {
  const responseIds = await loadReportSourceResponseIds(admin, reportId);
  const transcripts = await loadCompletedTranscriptRows(admin, responseIds, model);
  const segments = await loadTranscriptSegments(admin, transcripts.map((transcript) => transcript.id));
  const framesByResponse = groupTranscriptFramesByResponse(await loadReportFramesForQuotes(admin, reportId));

  const quoteRows = segments.flatMap((segment) => {
    const frame = matchTranscriptSegmentToFrame(segment, framesByResponse.get(segment.test_response_id) ?? []);

    if (!frame) {
      return [];
    }

    return [{
      report_id: reportId,
      test_response_id: segment.test_response_id,
      frame_id: frame.id,
      transcript_segment_id: segment.id,
      timestamp_ms: segment.start_ms,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      quote_text: segment.text,
      speaker: "Tester",
      include_in_summary: true,
    }];
  });

  if (quoteRows.length === 0) {
    return;
  }

  const { error } = await admin
    .from("usability_report_quotes")
    .upsert(quoteRows, { onConflict: "report_id,test_response_id,timestamp_ms,quote_text" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function markReportFailed(
  admin: SupabaseClient,
  reportId: string,
  errorMessage: string,
) {
  const { error } = await admin
    .from("usability_reports")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message);
  }
}

function encodeObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function normalizeR2BucketName(bucket: string) {
  return bucket.replace(/^r2:/i, "");
}

export async function createReportFrameSignedUrl(
  env: ReportFrameR2Environment,
  bucket: string,
  objectKey: string,
  expiresInSeconds = 60 * 60,
) {
  const r2 = new AwsClient({
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    region: "auto",
    service: "s3",
  });
  const bucketName = normalizeR2BucketName(bucket);
  const url = new URL(`${env.endpoint}/${encodeURIComponent(bucketName)}/${encodeObjectKey(objectKey)}`);

  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));

  const signedRequest = await r2.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });

  return signedRequest.url;
}
