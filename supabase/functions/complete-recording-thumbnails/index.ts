import {
  copyRecordingThumbnailToResponse,
  RECORDING_THUMBNAIL_BUCKET,
  RECORDING_THUMBNAIL_GENERATION_VERSION,
  type RecordingThumbnailUploadRow,
} from "../_shared/recording-thumbnails.ts";
import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingJson,
} from "../_shared/response-recordings.ts";

interface ThumbnailSuccessResult {
  recordingUploadId?: unknown;
  responseId?: unknown;
  recordingObjectKey?: unknown;
  storageBucket?: unknown;
  storageKey?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  width?: unknown;
  height?: unknown;
  timestampMs?: unknown;
  durationMs?: unknown;
  generationVersion?: unknown;
}

interface ThumbnailFailureResult {
  recordingUploadId?: unknown;
  recordingObjectKey?: unknown;
  error?: unknown;
}

interface ThumbnailCallbackRequest {
  jobId?: unknown;
  successes?: unknown;
  failures?: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THUMBNAIL_KEY_PATTERN = new RegExp(
  `^recording-thumbnails/${RECORDING_THUMBNAIL_GENERATION_VERSION}/([0-9a-f-]{36})\\.webp$`,
  "i",
);

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

function validateSuccess(input: ThumbnailSuccessResult) {
  const recordingUploadId = normalizedText(input.recordingUploadId);
  const responseId = normalizedText(input.responseId);
  const recordingObjectKey = normalizedText(input.recordingObjectKey).replace(/^\/+/, "");
  const storageBucket = normalizedText(input.storageBucket).replace(/^r2:/i, "");
  const storageKey = normalizedText(input.storageKey).replace(/^\/+/, "");
  const contentType = normalizedText(input.contentType).toLowerCase();
  const generationVersion = normalizedText(input.generationVersion);
  const sizeBytes = normalizedInteger(input.sizeBytes);
  const width = normalizedInteger(input.width);
  const height = normalizedInteger(input.height);
  const timestampMs = normalizedInteger(input.timestampMs);
  const durationMs = normalizedInteger(input.durationMs);
  const keyMatch = storageKey.match(THUMBNAIL_KEY_PATTERN);

  if (!UUID_PATTERN.test(recordingUploadId) || (responseId && !UUID_PATTERN.test(responseId))) {
    throw new Error("Thumbnail result contains an invalid recording or response id.");
  }
  if (!recordingObjectKey || storageBucket !== RECORDING_THUMBNAIL_BUCKET) {
    throw new Error("Thumbnail result contains an invalid source or destination bucket.");
  }
  if (!keyMatch || keyMatch[1]?.toLowerCase() !== recordingUploadId.toLowerCase()) {
    throw new Error("Thumbnail result contains an invalid versioned object key.");
  }
  if (
    generationVersion !== RECORDING_THUMBNAIL_GENERATION_VERSION ||
    contentType !== "image/webp"
  ) {
    throw new Error("Thumbnail result contains an unsupported generation or content type.");
  }
  if (sizeBytes === null || sizeBytes < 1 || sizeBytes > 2 * 1024 * 1024) {
    throw new Error("Thumbnail result contains an invalid file size.");
  }
  if (width !== 960 || height === null || height < 1 || height > 4096) {
    throw new Error("Thumbnail result contains invalid dimensions.");
  }
  if (
    timestampMs === null ||
    durationMs === null ||
    durationMs < 1 ||
    timestampMs < Math.floor(durationMs * 0.5) ||
    timestampMs > durationMs
  ) {
    throw new Error("Thumbnail result must use a frame at or after the recording midpoint.");
  }

  return {
    recordingUploadId,
    responseId: responseId || null,
    recordingObjectKey,
    storageBucket,
    storageKey,
    contentType,
    generationVersion,
    sizeBytes,
    width,
    height,
    timestampMs,
    durationMs,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return recordingJson({ error: "Method not allowed." }, 405);
  }

  const configuredSecret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim() ?? "";
  const providedSecret = request.headers.get("x-worker-secret")?.trim() ?? "";

  if (
    !configuredSecret ||
    !providedSecret ||
    !(await secureEqual(providedSecret, configuredSecret))
  ) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  let env;
  try {
    env = getRecordingEnvironment();
  } catch (error) {
    return recordingJson(
      { error: error instanceof Error ? error.message : "Callback setup is incomplete." },
      500,
    );
  }

  const payload = (await request.json().catch(() => null)) as ThumbnailCallbackRequest | null;
  const successes = Array.isArray(payload?.successes)
    ? (payload.successes.slice(0, 16) as ThumbnailSuccessResult[])
    : [];
  const failures = Array.isArray(payload?.failures)
    ? (payload.failures.slice(0, 16) as ThumbnailFailureResult[])
    : [];

  if (successes.length === 0 && failures.length === 0) {
    return recordingJson({ error: "The callback does not contain any thumbnail results." }, 400);
  }

  const admin = createRecordingAdminClient(env);
  const completedIds: string[] = [];
  const failedIds: string[] = [];
  const rejectedResults: Array<{ recordingUploadId: string; error: string }> = [];

  for (const rawResult of successes) {
    let result;
    try {
      result = validateSuccess(rawResult);
    } catch (error) {
      rejectedResults.push({
        recordingUploadId: normalizedText(rawResult.recordingUploadId),
        error: error instanceof Error ? error.message : "Invalid thumbnail result.",
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    const { data: updatedRow, error: updateError } = await admin
      .from("test_response_recording_uploads")
      .update({
        thumbnail_storage_bucket: result.storageBucket,
        thumbnail_path: result.storageKey,
        thumbnail_content_type: result.contentType,
        thumbnail_size_bytes: result.sizeBytes,
        thumbnail_width: result.width,
        thumbnail_height: result.height,
        thumbnail_processing_status: "ready",
        thumbnail_error: null,
        thumbnail_timestamp_ms: result.timestampMs,
        thumbnail_duration_ms: result.durationMs,
        thumbnail_generation_version: result.generationVersion,
        updated_at: nowIso,
      })
      .eq("id", result.recordingUploadId)
      .eq("object_key", result.recordingObjectKey)
      .select("*")
      .maybeSingle();

    if (updateError) {
      rejectedResults.push({
        recordingUploadId: result.recordingUploadId,
        error: updateError.message,
      });
      continue;
    }

    if (!updatedRow) {
      if (!result.responseId || result.responseId !== result.recordingUploadId) {
        rejectedResults.push({
          recordingUploadId: result.recordingUploadId,
          error: "Recording upload was not found.",
        });
        continue;
      }

      const { data: legacyResponse, error: legacyError } = await admin
        .from("test_responses")
        .update({
          recording_thumbnail_bucket: result.storageBucket,
          recording_thumbnail_path: result.storageKey,
          recording_thumbnail_content_type: result.contentType,
          recording_thumbnail_size_bytes: result.sizeBytes,
          recording_thumbnail_width: result.width,
          recording_thumbnail_height: result.height,
          recording_thumbnail_status: "ready",
          recording_thumbnail_error: null,
          recording_thumbnail_timestamp_ms: result.timestampMs,
          recording_thumbnail_duration_ms: result.durationMs,
          recording_thumbnail_generation_version: result.generationVersion,
        })
        .eq("id", result.responseId)
        .eq("recording_path", result.recordingObjectKey)
        .select("id")
        .maybeSingle();

      if (legacyError || !legacyResponse) {
        rejectedResults.push({
          recordingUploadId: result.recordingUploadId,
          error: legacyError?.message ?? "Legacy recording response was not found.",
        });
        continue;
      }

      completedIds.push(result.recordingUploadId);
      continue;
    }

    const uploadRow = updatedRow as RecordingThumbnailUploadRow;
    const attachedResponseId = uploadRow.attached_response_id;

    if (attachedResponseId) {
      await admin
        .from("test_responses")
        .update(copyRecordingThumbnailToResponse(uploadRow))
        .eq("id", attachedResponseId)
        .eq("recording_bucket", uploadRow.storage_bucket)
        .eq("recording_path", uploadRow.object_key);
    }

    completedIds.push(result.recordingUploadId);
  }

  for (const rawFailure of failures) {
    const recordingUploadId = normalizedText(rawFailure.recordingUploadId);
    const recordingObjectKey = normalizedText(rawFailure.recordingObjectKey).replace(/^\/+/, "");
    const message = normalizedText(rawFailure.error) || "Recording thumbnail processing failed.";

    if (!UUID_PATTERN.test(recordingUploadId) || !recordingObjectKey) {
      rejectedResults.push({ recordingUploadId, error: "Invalid thumbnail failure result." });
      continue;
    }

    const { data: updatedRow, error: updateError } = await admin
      .from("test_response_recording_uploads")
      .update({
        thumbnail_processing_status: "failed",
        thumbnail_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingUploadId)
      .eq("object_key", recordingObjectKey)
      .select("*")
      .maybeSingle();

    if (updateError) {
      rejectedResults.push({
        recordingUploadId,
        error: updateError.message,
      });
      continue;
    }

    if (!updatedRow) {
      const { data: legacyResponse, error: legacyError } = await admin
        .from("test_responses")
        .update({
          recording_thumbnail_status: "failed",
          recording_thumbnail_error: message.slice(0, 1000),
        })
        .eq("id", recordingUploadId)
        .eq("recording_path", recordingObjectKey)
        .select("id")
        .maybeSingle();

      if (legacyError || !legacyResponse) {
        rejectedResults.push({
          recordingUploadId,
          error: legacyError?.message ?? "Recording upload was not found.",
        });
        continue;
      }

      failedIds.push(recordingUploadId);
      continue;
    }

    const uploadRow = updatedRow as RecordingThumbnailUploadRow;
    if (uploadRow.attached_response_id) {
      await admin
        .from("test_responses")
        .update(copyRecordingThumbnailToResponse(uploadRow))
        .eq("id", uploadRow.attached_response_id);
    }
    failedIds.push(recordingUploadId);
  }

  return recordingJson(
    {
      ok: rejectedResults.length === 0,
      jobId: normalizedText(payload?.jobId) || null,
      completedIds,
      failedIds,
      rejectedResults,
    },
    rejectedResults.length > 0 && completedIds.length === 0 && failedIds.length === 0 ? 400 : 200,
  );
});
