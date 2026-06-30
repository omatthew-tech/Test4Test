import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

export const NO_RECORDINGS_ERROR = "no_recordings";

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

export interface WorkerResult {
  reportId: string;
  frameCount: number;
  sourceCount: number;
  frames: WorkerFrame[];
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

export interface ReportRow {
  id: string;
  submission_id: string;
  owner_user_id: string;
  report_number: number;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  source_response_count: number;
  frame_count: number;
  created_at: string;
  completed_at: string | null;
  worker_job_id?: string | null;
  submissions?: { product_name?: string | null } | Array<{ product_name?: string | null }> | null;
}

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
    status: report.status,
    errorMessage: report.error_message,
    sourceResponseCount: report.source_response_count,
    frameCount: report.frame_count,
    createdAt: report.created_at,
    completedAt: report.completed_at,
  };
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

  const { error: updateError } = await admin
    .from("usability_reports")
    .update({
      status: "completed",
      source_response_count: result.sourceCount,
      frame_count: result.frameCount,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (updateError) {
    throw new Error(updateError.message);
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
