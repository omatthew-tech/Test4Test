import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";

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

  for (const row of expiredRecordings) {
    const removeResult = await admin.storage.from(row.recording_bucket!).remove([row.recording_path!]);
    const missingObject = removeResult.error?.message?.toLowerCase().includes("not found") === true;

    if (!removeResult.error || missingObject) {
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

  return recordingJson({
    ok: true,
    expiredRecordingsDeleted: deletedExpiredIds.length,
    staleDraftsDeleted: deletedDraftCount,
  });
});
