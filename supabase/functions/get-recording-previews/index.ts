import {
  enqueueRecordingThumbnailBatch,
  enqueueRecordingThumbnailSources,
  RECORDING_THUMBNAIL_GENERATION_VERSION,
  RECORDING_THUMBNAIL_SIGNED_URL_SECONDS,
  scheduleRecordingThumbnailTask,
  signRecordingThumbnails,
  type RecordingThumbnailUploadRow,
} from "../_shared/recording-thumbnails.ts";
import { createR2PresignedUrl, getR2RecordingEnvironment } from "../_shared/r2-recordings.ts";
import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";

interface PreviewRequest {
  responseIds?: unknown;
}

interface SubmissionRow {
  id: string;
  product_name: string;
}

interface ResponseRow {
  id: string;
  submission_id: string;
  submitted_at: string;
  duration_seconds: number;
  recording_bucket: string;
  recording_path: string;
  recording_expires_at: string;
  recording_thumbnail_bucket: string | null;
  recording_thumbnail_path: string | null;
  recording_thumbnail_content_type: string | null;
  recording_thumbnail_size_bytes: number | null;
  recording_thumbnail_width: number | null;
  recording_thumbnail_height: number | null;
  recording_thumbnail_status: "pending" | "queued" | "processing" | "ready" | "failed" | null;
  recording_thumbnail_attempt_count: number | null;
  recording_thumbnail_last_attempt_at: string | null;
  recording_thumbnail_error: string | null;
  recording_thumbnail_timestamp_ms: number | null;
  recording_thumbnail_duration_ms: number | null;
  recording_thumbnail_generation_version: string | null;
}

function normalizeResponseIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

async function enqueueLegacyRecordingThumbnails(
  admin: ReturnType<typeof createRecordingAdminClient>,
  responses: ResponseRow[],
) {
  const r2Env = getR2RecordingEnvironment();
  const queued: ResponseRow[] = [];

  for (const response of responses.slice(0, 2)) {
    const recentAttempt = response.recording_thumbnail_last_attempt_at
      ? Date.now() - new Date(response.recording_thumbnail_last_attempt_at).getTime() <
        15 * 60 * 1000
      : false;
    if (
      recentAttempt &&
      (response.recording_thumbnail_status === "queued" ||
        response.recording_thumbnail_status === "processing")
    ) {
      continue;
    }

    const { error } = await admin
      .from("test_responses")
      .update({
        recording_thumbnail_status: "queued",
        recording_thumbnail_attempt_count:
          Math.max(0, response.recording_thumbnail_attempt_count ?? 0) + 1,
        recording_thumbnail_last_attempt_at: new Date().toISOString(),
        recording_thumbnail_error: null,
      })
      .eq("id", response.id)
      .eq("recording_path", response.recording_path);
    if (!error) {
      queued.push(response);
    }
  }

  if (queued.length === 0) {
    return;
  }

  try {
    await enqueueRecordingThumbnailSources(
      await Promise.all(
        queued.map(async (response) => ({
          recordingUploadId: response.id,
          responseId: response.id,
          objectKey: response.recording_path,
          url: await createR2PresignedUrl(r2Env, "GET", response.recording_path, {
            expiresInSeconds: 15 * 60,
          }),
          generationVersion: RECORDING_THUMBNAIL_GENERATION_VERSION,
        })),
      ),
    );
  } catch (error) {
    await admin
      .from("test_responses")
      .update({
        recording_thumbnail_status: "failed",
        recording_thumbnail_error: (error instanceof Error
          ? error.message
          : "Recording thumbnail enqueue failed."
        ).slice(0, 1000),
      })
      .in(
        "id",
        queued.map((response) => response.id),
      );
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: recordingCorsHeaders });
  }
  if (request.method !== "POST") {
    return recordingJson({ error: "Method not allowed." }, 405);
  }

  let env;
  try {
    env = getRecordingEnvironment();
  } catch (error) {
    return recordingJson(
      { error: error instanceof Error ? error.message : "Preview setup is incomplete." },
      500,
    );
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  const admin = createRecordingAdminClient(env);
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);
  if (userError || !user) {
    return recordingJson({ error: userError?.message ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as PreviewRequest;
  const requestedResponseIds = normalizeResponseIds(payload.responseIds);
  const { data: submissionData, error: submissionError } = await admin
    .from("submissions")
    .select("id, product_name")
    .eq("user_id", user.id);

  if (submissionError) {
    return recordingJson({ error: submissionError.message }, 500);
  }

  const submissions = (submissionData ?? []) as SubmissionRow[];
  const submissionById = new Map(submissions.map((submission) => [submission.id, submission]));
  if (submissionById.size === 0) {
    return recordingJson({
      ok: true,
      recordings: [],
      expiresInSeconds: RECORDING_THUMBNAIL_SIGNED_URL_SECONDS,
    });
  }

  const nowIso = new Date().toISOString();
  let responseQuery = admin
    .from("test_responses")
    .select(
      "id, submission_id, submitted_at, duration_seconds, recording_bucket, recording_path, recording_expires_at, recording_thumbnail_bucket, recording_thumbnail_path, recording_thumbnail_content_type, recording_thumbnail_size_bytes, recording_thumbnail_width, recording_thumbnail_height, recording_thumbnail_status, recording_thumbnail_attempt_count, recording_thumbnail_last_attempt_at, recording_thumbnail_error, recording_thumbnail_timestamp_ms, recording_thumbnail_duration_ms, recording_thumbnail_generation_version",
    )
    .in("submission_id", [...submissionById.keys()])
    .not("recording_bucket", "is", null)
    .not("recording_path", "is", null)
    .is("recording_deleted_at", null)
    .gt("recording_expires_at", nowIso)
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (requestedResponseIds.length > 0) {
    responseQuery = responseQuery.in("id", requestedResponseIds);
  }

  const { data: responseData, error: responseError } = await responseQuery;
  if (responseError) {
    return recordingJson({ error: responseError.message }, 500);
  }

  const responses = (responseData ?? []) as ResponseRow[];
  if (responses.length === 0) {
    return recordingJson({
      ok: true,
      recordings: [],
      expiresInSeconds: RECORDING_THUMBNAIL_SIGNED_URL_SECONDS,
    });
  }

  const { data: uploadData, error: uploadError } = await admin
    .from("test_response_recording_uploads")
    .select("*")
    .in(
      "attached_response_id",
      responses.map((response) => response.id),
    );

  if (uploadError) {
    return recordingJson({ error: uploadError.message }, 500);
  }

  const uploads = (uploadData ?? []) as RecordingThumbnailUploadRow[];
  const uploadByResponseId = new Map(
    uploads
      .filter((upload) => upload.attached_response_id)
      .map((upload) => [upload.attached_response_id as string, upload]),
  );
  const readyUploads = uploads.filter(
    (upload) =>
      upload.thumbnail_processing_status === "ready" &&
      upload.thumbnail_generation_version === RECORDING_THUMBNAIL_GENERATION_VERSION &&
      upload.thumbnail_storage_bucket &&
      upload.thumbnail_path,
  );
  const legacyResponses = responses.filter((response) => !uploadByResponseId.has(response.id));
  const readyLegacyResponses = legacyResponses.filter(
    (response) =>
      response.recording_thumbnail_status === "ready" &&
      response.recording_thumbnail_generation_version === RECORDING_THUMBNAIL_GENERATION_VERSION &&
      response.recording_thumbnail_bucket &&
      response.recording_thumbnail_path,
  );

  let signingError = "";
  let signedUrls = new Map<string, string>();
  try {
    signedUrls = await signRecordingThumbnails([
      ...readyUploads.map((upload) => ({
        id: upload.id,
        bucket: upload.thumbnail_storage_bucket as string,
        key: upload.thumbnail_path as string,
      })),
      ...readyLegacyResponses.map((response) => ({
        id: response.id,
        bucket: response.recording_thumbnail_bucket as string,
        key: response.recording_thumbnail_path as string,
      })),
    ]);
  } catch (error) {
    signingError =
      error instanceof Error ? error.message : "Recording preview is temporarily unavailable.";
    console.error("Could not sign recording thumbnails", { error: signingError });
  }

  const staleUploads = uploads.filter(
    (upload) =>
      !(
        upload.thumbnail_processing_status === "ready" &&
        upload.thumbnail_generation_version === RECORDING_THUMBNAIL_GENERATION_VERSION
      ),
  );
  if (staleUploads.length > 0) {
    scheduleRecordingThumbnailTask(enqueueRecordingThumbnailBatch(admin, staleUploads.slice(0, 4)));
  }
  const staleLegacyResponses = legacyResponses.filter(
    (response) =>
      !(
        response.recording_thumbnail_status === "ready" &&
        response.recording_thumbnail_generation_version === RECORDING_THUMBNAIL_GENERATION_VERSION
      ),
  );
  if (staleLegacyResponses.length > 0) {
    scheduleRecordingThumbnailTask(enqueueLegacyRecordingThumbnails(admin, staleLegacyResponses));
  }

  const recordings = responses.map((response) => {
    const submission = submissionById.get(response.submission_id);
    const upload = uploadByResponseId.get(response.id);
    const signedUrl = signedUrls.get(upload?.id ?? response.id) ?? null;
    const status = upload?.thumbnail_processing_status ?? response.recording_thumbnail_status;
    const generationVersion =
      upload?.thumbnail_generation_version ?? response.recording_thumbnail_generation_version;
    const isReady = Boolean(
      status === "ready" &&
      generationVersion === RECORDING_THUMBNAIL_GENERATION_VERSION &&
      signedUrl,
    );
    const isFailed = Boolean(signingError || status === "failed");

    return {
      responseId: response.id,
      submissionId: response.submission_id,
      productName: submission?.product_name ?? "Recording",
      submittedAt: response.submitted_at,
      durationSeconds: response.duration_seconds,
      thumbnailStatus: isReady ? "ready" : isFailed ? "failed" : "pending",
      thumbnailError: isFailed
        ? signingError ||
          upload?.thumbnail_error ||
          response.recording_thumbnail_error ||
          "Recording preview could not be generated."
        : null,
      thumbnail:
        isReady && signedUrl
          ? {
              url: signedUrl,
              width: upload?.thumbnail_width ?? response.recording_thumbnail_width,
              height: upload?.thumbnail_height ?? response.recording_thumbnail_height,
              contentType:
                upload?.thumbnail_content_type ?? response.recording_thumbnail_content_type,
              sizeBytes: upload?.thumbnail_size_bytes ?? response.recording_thumbnail_size_bytes,
              timestampMs:
                upload?.thumbnail_timestamp_ms ?? response.recording_thumbnail_timestamp_ms,
              durationMs: upload?.thumbnail_duration_ms ?? response.recording_thumbnail_duration_ms,
              generationVersion,
            }
          : null,
    };
  });

  return recordingJson({
    ok: true,
    recordings,
    expiresInSeconds: RECORDING_THUMBNAIL_SIGNED_URL_SECONDS,
  });
});
