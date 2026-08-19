import type { SupabaseClient } from "npm:@supabase/supabase-js@2.100.1";

export const RECORDING_THUMBNAIL_GENERATION_VERSION = "scene-after-half-v1";
export const RECORDING_THUMBNAIL_BUCKET = "usability-test-screenshots";
export const RECORDING_THUMBNAIL_SIGNED_URL_SECONDS = 60 * 60;
export const RECORDING_THUMBNAIL_MAX_BATCH_SIZE = 16;

export type RecordingThumbnailProcessingStatus =
  "pending" | "queued" | "processing" | "ready" | "failed";

export interface RecordingThumbnailUploadRow {
  id: string;
  attached_response_id: string | null;
  storage_bucket: string;
  object_key: string;
  status: string;
  expires_at: string | null;
  thumbnail_storage_bucket: string | null;
  thumbnail_path: string | null;
  thumbnail_content_type: string | null;
  thumbnail_size_bytes: number | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  thumbnail_processing_status: RecordingThumbnailProcessingStatus;
  thumbnail_attempt_count: number;
  thumbnail_last_attempt_at: string | null;
  thumbnail_error: string | null;
  thumbnail_timestamp_ms: number | null;
  thumbnail_duration_ms: number | null;
  thumbnail_generation_version: string | null;
}

export interface RecordingThumbnailWorkerSource {
  recordingUploadId: string;
  responseId?: string;
  bucket?: string;
  objectKey: string;
  url?: string;
  durationSeconds?: number;
  generationVersion: string;
}

interface WorkerEnvironment {
  baseUrl: string;
  sharedSecret: string;
}

function getWorkerEnvironment(): WorkerEnvironment {
  const baseUrl = Deno.env.get("VIDEO_PROCESSOR_URL")?.trim().replace(/\/+$/g, "") ?? "";
  const sharedSecret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim() ?? "";

  if (!baseUrl || !sharedSecret) {
    throw new Error("Recording thumbnail worker configuration is incomplete.");
  }

  return { baseUrl, sharedSecret };
}

function normalizeWorkerError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
  }

  return fallback;
}

export function scheduleRecordingThumbnailTask(task: Promise<unknown>) {
  const runtime = (
    globalThis as {
      EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
    }
  ).EdgeRuntime;

  const guardedTask = task.catch((error) => {
    console.error("Recording thumbnail background task failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (runtime?.waitUntil) {
    runtime.waitUntil(guardedTask);
  }
}

export function shouldEnqueueRecordingThumbnail(
  row: Pick<
    RecordingThumbnailUploadRow,
    "thumbnail_processing_status" | "thumbnail_generation_version" | "thumbnail_last_attempt_at"
  >,
  now = Date.now(),
) {
  if (
    row.thumbnail_processing_status === "ready" &&
    row.thumbnail_generation_version === RECORDING_THUMBNAIL_GENERATION_VERSION
  ) {
    return false;
  }

  if (
    (row.thumbnail_processing_status === "queued" ||
      row.thumbnail_processing_status === "processing") &&
    row.thumbnail_last_attempt_at
  ) {
    const lastAttemptMs = new Date(row.thumbnail_last_attempt_at).getTime();
    if (Number.isFinite(lastAttemptMs) && now - lastAttemptMs < 15 * 60 * 1000) {
      return false;
    }
  }

  return true;
}

export async function enqueueRecordingThumbnailBatch(
  admin: SupabaseClient,
  rows: RecordingThumbnailUploadRow[],
) {
  const candidates = rows
    .filter((row) => row.status === "completed" && shouldEnqueueRecordingThumbnail(row))
    .slice(0, RECORDING_THUMBNAIL_MAX_BATCH_SIZE);

  if (candidates.length === 0) {
    return { queuedIds: [] as string[], jobId: null as string | null };
  }

  const nowIso = new Date().toISOString();
  const queuedRows: RecordingThumbnailUploadRow[] = [];

  for (const row of candidates) {
    const { data, error } = await admin
      .from("test_response_recording_uploads")
      .update({
        thumbnail_processing_status: "queued",
        thumbnail_attempt_count: Math.max(0, row.thumbnail_attempt_count ?? 0) + 1,
        thumbnail_last_attempt_at: nowIso,
        thumbnail_error: null,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("thumbnail_attempt_count", Math.max(0, row.thumbnail_attempt_count ?? 0))
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Could not reserve recording thumbnail work", {
        recordingUploadId: row.id,
        error: error.message,
      });
      continue;
    }

    if (data) {
      queuedRows.push(data as RecordingThumbnailUploadRow);
    }
  }

  if (queuedRows.length === 0) {
    return { queuedIds: [] as string[], jobId: null as string | null };
  }

  const responseIds = queuedRows
    .map((row) => row.attached_response_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const durationByResponseId = new Map<string, number>();
  if (responseIds.length > 0) {
    const { data: responseDurations, error: durationError } = await admin
      .from("test_responses")
      .select("id, duration_seconds")
      .in("id", responseIds);
    if (durationError) {
      console.error("Could not load trusted recording durations; worker will probe instead", {
        error: durationError.message,
      });
    } else {
      for (const response of responseDurations ?? []) {
        const durationSeconds = Number(response.duration_seconds);
        if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
          durationByResponseId.set(response.id as string, durationSeconds);
        }
      }
    }
  }

  const sources: RecordingThumbnailWorkerSource[] = queuedRows.map((row) => {
    const durationSeconds = row.attached_response_id
      ? durationByResponseId.get(row.attached_response_id)
      : undefined;
    return {
      recordingUploadId: row.id,
      ...(row.attached_response_id ? { responseId: row.attached_response_id } : {}),
      bucket: row.storage_bucket,
      objectKey: row.object_key,
      ...(durationSeconds ? { durationSeconds } : {}),
      generationVersion: RECORDING_THUMBNAIL_GENERATION_VERSION,
    };
  });

  try {
    const workerResult = await enqueueRecordingThumbnailSources(sources);
    return { queuedIds: queuedRows.map((row) => row.id), jobId: workerResult.jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recording thumbnail enqueue failed.";
    await admin
      .from("test_response_recording_uploads")
      .update({
        thumbnail_processing_status: "failed",
        thumbnail_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        queuedRows.map((row) => row.id),
      );

    throw error;
  }
}

export async function enqueueRecordingThumbnailSources(sources: RecordingThumbnailWorkerSource[]) {
  if (sources.length === 0) {
    return { jobId: null as string | null };
  }

  const env = getWorkerEnvironment();
  const response = await fetch(`${env.baseUrl}/recordings/thumbnails/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": env.sharedSecret,
    },
    body: JSON.stringify({ sources: sources.slice(0, RECORDING_THUMBNAIL_MAX_BATCH_SIZE) }),
  });
  const payload = (await response.json().catch(() => null)) as {
    jobId?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.jobId) {
    throw new Error(
      normalizeWorkerError(
        payload,
        `Recording thumbnail worker rejected the job (HTTP ${response.status}).`,
      ),
    );
  }

  return { jobId: payload.jobId };
}

export async function signRecordingThumbnails(
  requests: Array<{ id: string; bucket: string; key: string }>,
) {
  if (requests.length === 0) {
    return new Map<string, string>();
  }

  const env = getWorkerEnvironment();
  const response = await fetch(`${env.baseUrl}/frames/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": env.sharedSecret,
    },
    body: JSON.stringify({ frames: requests.slice(0, 200) }),
  });
  const payload = (await response.json().catch(() => null)) as {
    frames?: Array<{ id?: string; url?: string }>;
    error?: string;
  } | null;

  if (!response.ok || !Array.isArray(payload?.frames)) {
    throw new Error(
      normalizeWorkerError(
        payload,
        `Recording thumbnail URLs could not be signed (HTTP ${response.status}).`,
      ),
    );
  }

  return new Map(
    payload.frames
      .filter(
        (frame): frame is { id: string; url: string } =>
          typeof frame.id === "string" && typeof frame.url === "string" && frame.url.length > 0,
      )
      .map((frame) => [frame.id, frame.url]),
  );
}

export async function deleteGeneratedRecordingThumbnails(
  requests: Array<{ id: string; bucket: string; key: string }>,
) {
  const generated = requests.filter((request) => request.key.startsWith("recording-thumbnails/"));
  if (generated.length === 0) {
    return [] as string[];
  }

  const env = getWorkerEnvironment();
  const response = await fetch(`${env.baseUrl}/frames/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": env.sharedSecret,
    },
    body: JSON.stringify({ frames: generated.slice(0, 200) }),
  });
  const payload = (await response.json().catch(() => null)) as {
    deletedIds?: string[];
    error?: string;
  } | null;

  if (!response.ok || !Array.isArray(payload?.deletedIds)) {
    throw new Error(
      normalizeWorkerError(
        payload,
        `Recording thumbnails could not be deleted (HTTP ${response.status}).`,
      ),
    );
  }

  return payload.deletedIds;
}

export function copyRecordingThumbnailToResponse(row: RecordingThumbnailUploadRow) {
  return {
    recording_thumbnail_bucket: row.thumbnail_storage_bucket,
    recording_thumbnail_path: row.thumbnail_path,
    recording_thumbnail_content_type: row.thumbnail_content_type,
    recording_thumbnail_size_bytes: row.thumbnail_size_bytes,
    recording_thumbnail_width: row.thumbnail_width,
    recording_thumbnail_height: row.thumbnail_height,
    recording_thumbnail_status: row.thumbnail_processing_status,
    recording_thumbnail_attempt_count: row.thumbnail_attempt_count,
    recording_thumbnail_last_attempt_at: row.thumbnail_last_attempt_at,
    recording_thumbnail_error: row.thumbnail_error,
    recording_thumbnail_timestamp_ms: row.thumbnail_timestamp_ms,
    recording_thumbnail_duration_ms: row.thumbnail_duration_ms,
    recording_thumbnail_generation_version: row.thumbnail_generation_version,
  };
}
