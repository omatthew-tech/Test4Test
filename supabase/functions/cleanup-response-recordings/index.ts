import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";
import {
  getR2RecordingEnvironment,
  r2Fetch,
} from "../_shared/r2-recordings.ts";

interface CleanupRequest {
  limit?: number;
}

interface ExpiredRecordingRow {
  id: string;
  recording_bucket: string | null;
  recording_path: string | null;
}

interface StaleDraftRow {
  bucket_id: string;
  object_name: string;
}

interface R2UploadRow {
  id: string;
  object_key: string;
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
    return recordingJson({ error: error instanceof Error ? error.message : "Recording cleanup setup is incomplete." }, 500);
  }

  const providedSecret = request.headers.get("x-recording-cleanup-secret")?.trim() ?? "";

  if (!env.cleanupSecret || providedSecret !== env.cleanupSecret) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as CleanupRequest;
  const limit = normalizeLimit(payload.limit, 50);
  const admin = createRecordingAdminClient(env);
  const nowIso = new Date().toISOString();

  const { data: expiredRows, error: expiredError } = await admin
    .from("test_responses")
    .select("id, recording_bucket, recording_path")
    .not("recording_bucket", "is", null)
    .not("recording_path", "is", null)
    .is("recording_deleted_at", null)
    .lte("recording_expires_at", nowIso)
    .order("recording_expires_at", { ascending: true })
    .limit(limit);

  if (expiredError) {
    return recordingJson({ error: expiredError.message }, 500);
  }

  const expiredRecordings = ((expiredRows ?? []) as ExpiredRecordingRow[]).filter(
    (row) => row.recording_bucket && row.recording_path,
  );
  const deletedExpiredIds: string[] = [];
  let r2Env: ReturnType<typeof getR2RecordingEnvironment> | null = null;

  const getR2Env = () => {
    if (!r2Env) {
      r2Env = getR2RecordingEnvironment();
    }

    return r2Env;
  };

  for (const row of expiredRecordings) {
    let removed = false;

    if (row.recording_bucket!.startsWith("r2:")) {
      const removeResult = await r2Fetch(getR2Env(), row.recording_path!, { method: "DELETE" });
      removed = removeResult.ok || removeResult.status === 404;
    } else {
      const removeResult = await admin.storage.from(row.recording_bucket!).remove([row.recording_path!]);
      const missingObject = removeResult.error?.message?.toLowerCase().includes("not found") === true;
      removed = !removeResult.error || missingObject;
    }

    if (removed) {
      const { error: updateError } = await admin
        .from("test_responses")
        .update({ recording_deleted_at: nowIso })
        .eq("id", row.id);

      if (!updateError) {
        deletedExpiredIds.push(row.id);
      }
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
    .select("id, object_key, upload_id, status")
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
    if (row.status === "uploading" && row.upload_id) {
      await r2Fetch(getR2Env(), row.object_key, {
        method: "DELETE",
        query: { uploadId: row.upload_id },
      }).catch(() => null);

      const { error: updateError } = await admin
        .from("test_response_recording_uploads")
        .update({ status: "aborted", updated_at: nowIso })
        .eq("id", row.id);

      if (!updateError) {
        abortedR2MultipartCount += 1;
      }

      continue;
    }

    const removeResult = await r2Fetch(getR2Env(), row.object_key, { method: "DELETE" }).catch(() => null);

    if (!removeResult || removeResult.ok || removeResult.status === 404) {
      const { error: updateError } = await admin
        .from("test_response_recording_uploads")
        .update({ status: "deleted", updated_at: nowIso })
        .eq("id", row.id);

      if (!updateError) {
        deletedR2DraftCount += 1;
      }
    }
  }

  return recordingJson({
    ok: true,
    expiredRecordingsDeleted: deletedExpiredIds.length,
    staleDraftsDeleted: deletedDraftCount,
    staleR2DraftsDeleted: deletedR2DraftCount,
    staleR2MultipartUploadsAborted: abortedR2MultipartCount,
  });
});
