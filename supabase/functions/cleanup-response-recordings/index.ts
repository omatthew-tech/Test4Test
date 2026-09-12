import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";
import { getR2RecordingEnvironment, r2Fetch } from "../_shared/r2-recordings.ts";
import { deleteGeneratedRecordingThumbnails } from "../_shared/recording-thumbnails.ts";

interface CleanupRequest {
  limit?: number;
}

interface StaleDraftRow {
  bucket_id: string;
  object_name: string;
}

interface R2UploadRow {
  id: string;
  object_key: string;
  thumbnail_path: string | null;
  upload_id: string | null;
  status: string;
}

function normalizeLimit(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(Math.round(value), 200))
    : fallback;
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
      { error: error instanceof Error ? error.message : "Recording cleanup setup is incomplete." },
      500,
    );
  }

  const providedSecret = request.headers.get("x-recording-cleanup-secret")?.trim() ?? "";

  if (!env.cleanupSecret || providedSecret !== env.cleanupSecret) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as CleanupRequest;
  const limit = normalizeLimit(payload.limit, 50);
  const admin = createRecordingAdminClient(env);
  const nowIso = new Date().toISOString();
  let r2Env: ReturnType<typeof getR2RecordingEnvironment> | null = null;

  const getR2Env = () => {
    if (!r2Env) {
      r2Env = getR2RecordingEnvironment();
    }

    return r2Env;
  };

  const { data: versionDeletions, error: versionDeletionError } = await admin
    .from("recording_version_deletions")
    .select("id, bucket, path")
    .order("created_at")
    .limit(limit);
  if (versionDeletionError) return recordingJson({ error: versionDeletionError.message }, 500);
  let deletedVersionFiles = 0;
  for (const item of versionDeletions ?? []) {
    try {
      if (item.path.startsWith("recording-thumbnails/")) {
        const deletedIds = await deleteGeneratedRecordingThumbnails([
          { id: item.id, bucket: item.bucket, key: item.path },
        ]);
        if (!deletedIds.includes(item.id)) continue;
      } else if (item.bucket.startsWith("r2:")) {
        if (item.bucket !== getR2Env().providerBucket) continue;
        const result = await r2Fetch(getR2Env(), item.path, { method: "DELETE" });
        if (!result.ok && result.status !== 404) continue;
      } else {
        const { error } = await admin.storage.from(item.bucket).remove([item.path]);
        if (error) continue;
      }
      const { error } = await admin.from("recording_version_deletions").delete().eq("id", item.id);
      if (!error) deletedVersionFiles++;
    } catch {
      /* Retain the queue entry for the next cleanup attempt. */
    }
  }

  const { data: staleDraftRows, error: staleDraftError } = await admin.rpc(
    "list_stale_test_response_recording_drafts",
    { p_limit: limit * 2 },
  );

  if (staleDraftError) {
    return recordingJson({ error: staleDraftError.message }, 500);
  }

  const staleDrafts = (staleDraftRows ?? []) as StaleDraftRow[];
  let deletedDraftCount = 0;

  const draftPathsByBucket = staleDrafts.reduce<Record<string, string[]>>((groups, row) => {
    if (!row.bucket_id || !row.object_name) {
      return groups;
    }

    groups[row.bucket_id] = [...(groups[row.bucket_id] ?? []), row.object_name];
    return groups;
  }, {});

  for (const [bucketId, objectNames] of Object.entries(draftPathsByBucket)) {
    if (objectNames.length === 0) {
      continue;
    }

    const removeResult = await admin.storage.from(bucketId).remove(objectNames);

    if (!removeResult.error) {
      deletedDraftCount += objectNames.length;
    }
  }

  const staleCutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: staleR2Rows, error: staleR2Error } = await admin
    .from("test_response_recording_uploads")
    .select("id, object_key, thumbnail_path, upload_id, status")
    .eq("storage_provider", "r2")
    .is("attached_response_id", null)
    .in("status", ["pending", "uploading", "completed"])
    .lte("updated_at", staleCutoffIso)
    .order("updated_at", { ascending: true })
    .limit(limit * 2);

  if (staleR2Error) {
    return recordingJson({ error: staleR2Error.message }, 500);
  }

  let deletedR2DraftCount = 0;
  let abortedR2MultipartCount = 0;

  for (const row of (staleR2Rows ?? []) as R2UploadRow[]) {
    const { data: claimed, error: claimError } = await admin
      .from("test_response_recording_uploads")
      .update({ status: "deleted", updated_at: nowIso })
      .eq("id", row.id)
      .eq("status", row.status)
      .is("attached_response_id", null)
      .lte("updated_at", staleCutoffIso)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;

    if (row.status === "uploading" && row.upload_id) {
      await r2Fetch(getR2Env(), row.object_key, {
        method: "DELETE",
        query: { uploadId: row.upload_id },
      }).catch(() => null);

      abortedR2MultipartCount += 1;

      continue;
    }

    const removeResult = await r2Fetch(getR2Env(), row.object_key, { method: "DELETE" }).catch(
      () => null,
    );
    if (row.thumbnail_path?.startsWith("draft/")) {
      await r2Fetch(getR2Env(), row.thumbnail_path, { method: "DELETE" }).catch(() => null);
    }

    if (removeResult && (removeResult.ok || removeResult.status === 404)) {
      deletedR2DraftCount += 1;
    }
  }

  return recordingJson({
    ok: true,
    expiredRecordingsDeleted: 0,
    deletedVersionFiles,
    staleDraftsDeleted: deletedDraftCount,
    staleR2DraftsDeleted: deletedR2DraftCount,
    staleR2MultipartUploadsAborted: abortedR2MultipartCount,
  });
});
