import {
  enqueueRecordingThumbnailBatch,
  enqueueRecordingThumbnailSources,
  RECORDING_THUMBNAIL_GENERATION_VERSION,
  type RecordingThumbnailUploadRow,
} from "../_shared/recording-thumbnails.ts";
import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingJson,
} from "../_shared/response-recordings.ts";

interface BackfillRequest {
  limit?: unknown;
  batchSize?: unknown;
}

function normalizeLimit(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(Math.round(value), 4))
    : 2;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return recordingJson({ error: "Method not allowed." }, 405);
  }

  const configuredSecret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim() ?? "";
  const providedSecret = request.headers.get("x-worker-secret")?.trim() ?? "";
  if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  let env;
  try {
    env = getRecordingEnvironment();
  } catch (error) {
    return recordingJson(
      { error: error instanceof Error ? error.message : "Backfill setup is incomplete." },
      500,
    );
  }

  const payload = (await request.json().catch(() => ({}))) as BackfillRequest;
  const limit = normalizeLimit(payload.batchSize ?? payload.limit);
  const admin = createRecordingAdminClient(env);
  const nowIso = new Date().toISOString();
  const staleFilter = [
    "thumbnail_generation_version.is.null",
    `thumbnail_generation_version.neq.${RECORDING_THUMBNAIL_GENERATION_VERSION}`,
    "thumbnail_processing_status.neq.ready",
  ].join(",");
  const { data, error } = await admin
    .from("test_response_recording_uploads")
    .select("*")
    .eq("status", "completed")
    .not("attached_response_id", "is", null)
    .gt("expires_at", nowIso)
    .or(staleFilter)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return recordingJson({ error: error.message }, 500);
  }

  const rows = (data ?? []) as RecordingThumbnailUploadRow[];
  if (rows.length === 0) {
    const { data: legacyData, error: legacyError } = await admin
      .from("test_responses")
      .select(
        "id, duration_seconds, recording_bucket, recording_path, recording_thumbnail_status, recording_thumbnail_attempt_count, recording_thumbnail_last_attempt_at, recording_thumbnail_generation_version",
      )
      .not("recording_bucket", "is", null)
      .not("recording_path", "is", null)
      .is("recording_deleted_at", null)
      .gt("recording_expires_at", nowIso)
      .or(
        [
          "recording_thumbnail_generation_version.is.null",
          `recording_thumbnail_generation_version.neq.${RECORDING_THUMBNAIL_GENERATION_VERSION}`,
          "recording_thumbnail_status.neq.ready",
        ].join(","),
      )
      .order("submitted_at", { ascending: true })
      .limit(12);

    if (legacyError) {
      return recordingJson({ error: legacyError.message }, 500);
    }

    const legacyCandidates = (legacyData ?? []) as Array<{
      id: string;
      duration_seconds: number | null;
      recording_bucket: string;
      recording_path: string;
      recording_thumbnail_status: string | null;
      recording_thumbnail_attempt_count: number | null;
      recording_thumbnail_last_attempt_at: string | null;
      recording_thumbnail_generation_version: string | null;
    }>;
    if (legacyCandidates.length === 0) {
      return recordingJson({ ok: true, queuedIds: [], jobId: null, complete: true });
    }

    const { data: attachedUploads, error: attachedError } = await admin
      .from("test_response_recording_uploads")
      .select("attached_response_id")
      .in(
        "attached_response_id",
        legacyCandidates.map((response) => response.id),
      );
    if (attachedError) {
      return recordingJson({ error: attachedError.message }, 500);
    }

    const attachedIds = new Set(
      (attachedUploads ?? []).map((upload) => upload.attached_response_id as string),
    );
    const legacyRows = legacyCandidates
      .filter((response) => !attachedIds.has(response.id))
      .filter((response) => {
        if (
          response.recording_thumbnail_status !== "queued" &&
          response.recording_thumbnail_status !== "processing"
        ) {
          return true;
        }
        const attemptedAt = response.recording_thumbnail_last_attempt_at
          ? new Date(response.recording_thumbnail_last_attempt_at).getTime()
          : 0;
        return !Number.isFinite(attemptedAt) || Date.now() - attemptedAt >= 15 * 60 * 1000;
      })
      .slice(0, limit);

    if (legacyRows.length === 0) {
      return recordingJson({ ok: true, queuedIds: [], jobId: null, complete: false });
    }

    const nowAttemptIso = new Date().toISOString();
    for (const response of legacyRows) {
      await admin
        .from("test_responses")
        .update({
          recording_thumbnail_status: "queued",
          recording_thumbnail_attempt_count:
            Math.max(0, response.recording_thumbnail_attempt_count ?? 0) + 1,
          recording_thumbnail_last_attempt_at: nowAttemptIso,
          recording_thumbnail_error: null,
        })
        .eq("id", response.id);
    }

    try {
      const workerResult = await enqueueRecordingThumbnailSources(
        legacyRows.map((response) => ({
          recordingUploadId: response.id,
          responseId: response.id,
          objectKey: response.recording_path,
          ...(typeof response.duration_seconds === "number" && response.duration_seconds > 0
            ? { durationSeconds: response.duration_seconds }
            : {}),
          generationVersion: RECORDING_THUMBNAIL_GENERATION_VERSION,
        })),
      );
      return recordingJson({
        ok: true,
        queuedIds: legacyRows.map((response) => response.id),
        jobId: workerResult.jobId,
        complete: false,
        batchSize: legacyRows.length,
        generationVersion: RECORDING_THUMBNAIL_GENERATION_VERSION,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Legacy thumbnail enqueue failed.";
      await admin
        .from("test_responses")
        .update({
          recording_thumbnail_status: "failed",
          recording_thumbnail_error: message.slice(0, 1000),
        })
        .in(
          "id",
          legacyRows.map((response) => response.id),
        );
      return recordingJson({ error: message }, 502);
    }
  }

  try {
    const queued = await enqueueRecordingThumbnailBatch(admin, rows);
    return recordingJson({
      ok: true,
      ...queued,
      complete: false,
      batchSize: rows.length,
      generationVersion: RECORDING_THUMBNAIL_GENERATION_VERSION,
    });
  } catch (error) {
    return recordingJson(
      {
        error: error instanceof Error ? error.message : "Recording thumbnail backfill failed.",
      },
      502,
    );
  }
});
