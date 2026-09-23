import { ClipError, type ClipAdmin } from "./clip-http.ts";
import { getR2RecordingEnvironment, r2Fetch } from "./r2-recordings.ts";
import { receivedFeedbackAccess } from "./feedback-access.ts";

export async function clipSource(
  admin: ClipAdmin,
  responseId: string,
  versionId: string | null,
  userId?: string,
) {
  const { data: response, error } = await admin
    .from("test_responses")
    .select(
      "id, submission_id, tester_user_id, feedback_source, recording_bucket, recording_path, recording_deleted_at",
    )
    .eq("id", responseId)
    .maybeSingle();
  if (error) throw new Error("Source lookup failed");
  if (!response || response.recording_deleted_at)
    throw new ClipError("This recording is no longer available.", 410);
  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select("user_id, product_name")
    .eq("id", response.submission_id)
    .maybeSingle();
  if (submissionError) throw new Error("Source lookup failed");
  if (!submission) throw new ClipError("This recording is no longer available.", 410);
  if (userId && userId !== response.tester_user_id && userId !== submission.user_id)
    throw new ClipError("You do not have access to this recording.", 403);
  if (userId && response.feedback_source === "earn") {
    const access = await receivedFeedbackAccess(admin, submission.user_id, [responseId]);
    if (access.get(responseId) === "locked")
      throw new ClipError("This feedback must be opened before creating or accessing clips.", 403);
  }
  let source = response;
  if (versionId) {
    const { data: version, error: versionError } = await admin
      .from("test_response_versions")
      .select("recording_bucket, recording_path, recording_deleted_at")
      .eq("id", versionId)
      .eq("response_id", responseId)
      .maybeSingle();
    if (versionError) throw new Error("Version lookup failed");
    if (!version) throw new ClipError("This recording is no longer available.", 410);
    source = { ...response, ...version };
  }
  if (!source.recording_bucket || !source.recording_path || source.recording_deleted_at)
    throw new ClipError("This recording is no longer available.", 410);
  return {
    bucket: source.recording_bucket,
    path: source.recording_path,
    productName: submission.product_name,
    ownerId: submission.user_id,
    testerId: response.tester_user_id,
  };
}

export async function dispatchClips(admin: ClipAdmin, clipId?: string) {
  const workerUrl = Deno.env.get("VIDEO_PROCESSOR_URL")?.trim().replace(/\/+$/, "");
  const secret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim();
  if (!workerUrl || !secret) throw new Error("Clip worker is not configured");
  const { data: jobs, error } = await admin.rpc("claim_recording_clips", {
    p_limit: clipId ? 1 : 2,
    p_clip_id: clipId ?? null,
  });
  if (error) throw new Error("Clip claim failed");
  for (const job of jobs ?? []) {
    let event = "failed";
    try {
      let source;
      if (job.source_bucket.startsWith("r2:"))
        source = { bucket: job.source_bucket.slice(3), objectKey: job.source_path };
      else {
        const { data, error } = await admin.storage
          .from(job.source_bucket)
          .createSignedUrl(job.source_path, 3600);
        if (error || !data?.signedUrl) throw new Error("Source access failed");
        source = { url: data.signedUrl };
      }
      const response = await fetch(`${workerUrl}/recordings/clips/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": secret },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          clipId: job.id,
          attemptId: job.attempt_id,
          startMs: job.start_ms,
          endMs: job.end_ms,
          source,
        }),
      });
      if (response.ok) continue;
      if (response.status === 429 || response.status === 503) event = "busy";
    } catch {
      /* Durable retries recover network failures without logging private media URLs. */
    }
    const { error: finishError } = await admin.rpc("finish_recording_clip", {
      p_id: job.id,
      p_attempt_id: job.attempt_id,
      p_event: event,
    });
    if (finishError) throw new Error("Clip recovery failed");
  }
}

export async function cleanupClipAssets(admin: ClipAdmin) {
  const { data: assets, error } = await admin.rpc("recording_clip_garbage");
  if (error) throw new Error("Clip cleanup lookup failed");
  const env = getR2RecordingEnvironment();
  let deleted = 0;
  for (const asset of assets ?? []) {
    try {
      const response = await r2Fetch(env, asset.object_path, {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok || response.status === 404) {
        const { error } = await admin
          .from("recording_clip_assets")
          .delete()
          .eq("object_path", asset.object_path);
        if (!error) deleted++;
      }
    } catch {
      // Keep this ledger entry and continue the batch; one storage failure must not starve others.
      console.error("Clip asset cleanup deferred");
    }
  }
  return deleted;
}
