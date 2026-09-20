import {
  ClipError,
  clipHandler,
  clipJson,
  clipToken,
  clipUuid,
  hashClipToken,
} from "../_shared/clip-http.ts";
import { clipSource, dispatchClips } from "../_shared/recording-clips.ts";
import {
  buildDownloadContentDisposition,
  createR2PresignedUrl,
  getR2RecordingEnvironment,
} from "../_shared/r2-recordings.ts";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void } | undefined;

Deno.serve((request) =>
  clipHandler(request, "client", async ({ admin, userId, body }) => {
    const { action } = body;
    if (action === "create") {
      if (
        typeof body.id !== "string" ||
        !clipUuid.test(body.id) ||
        typeof body.responseId !== "string" ||
        !clipUuid.test(body.responseId) ||
        (body.versionId != null &&
          (typeof body.versionId !== "string" || !clipUuid.test(body.versionId))) ||
        typeof body.token !== "string" ||
        !clipToken.test(body.token) ||
        !Number.isSafeInteger(body.startMs) ||
        !Number.isSafeInteger(body.endMs) ||
        Number(body.startMs) < 0 ||
        Number(body.endMs) - Number(body.startMs) < 100 ||
        Number(body.endMs) > 86400000
      )
        throw new ClipError("Choose a valid clip start and end.");
      // Fail before saving if no export service has been configured.
      if (!Deno.env.get("VIDEO_PROCESSOR_URL") || !Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET"))
        throw new ClipError("Clip exports are not configured yet.", 503);
      const source = await clipSource(
        admin,
        body.responseId,
        (body.versionId as string) ?? null,
        userId,
      );
      const { data: clip, error } = await admin.rpc("create_recording_clip", {
        p_id: body.id,
        p_response_id: body.responseId,
        p_version_id: body.versionId ?? null,
        p_creator_id: userId,
        p_source_bucket: source.bucket,
        p_source_path: source.path,
        p_start_ms: body.startMs,
        p_end_ms: body.endMs,
        p_token_hash: await hashClipToken(body.token),
      });
      if (error) {
        if (error.code === "P0001")
          throw new ClipError(
            "Please wait for your current clips to finish, or try again later.",
            429,
          );
        if (error.code === "22023" || error.code === "23505")
          throw new ClipError("This clip request has changed. Start a new clip.", 409);
        if (error.code === "42501")
          throw new ClipError("This recording is no longer available.", 410);
        throw new Error("Clip creation failed");
      }
      const work = dispatchClips(admin, body.id).catch(() => {
        console.error("Clip dispatch deferred");
      });
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
      else await work;
      return clipJson({ ok: true, id: clip.id, status: clip.status }, 202);
    }
    if (action === "public") {
      if (
        Object.keys(body).some((key) => !["action", "token"].includes(key)) ||
        typeof body.token !== "string" ||
        !clipToken.test(body.token)
      )
        throw new ClipError("This clip link is invalid or unavailable.", 404);
      const { data: clip, error } = await admin
        .from("recording_clips")
        .select("*")
        .eq("token_hash", await hashClipToken(body.token))
        .maybeSingle();
      if (error) throw new Error("Clip lookup failed");
      if (!clip) throw new ClipError("This clip link is invalid or unavailable.", 404);
      const source = await clipSource(admin, clip.response_id, clip.version_id);
      if (
        source.bucket !== clip.source_bucket ||
        source.path !== clip.source_path ||
        ![source.ownerId, source.testerId].includes(clip.creator_id)
      )
        throw new ClipError("This clip is no longer available.", 410);
      const metadata = {
        ok: true,
        status: clip.status,
        productName: source.productName,
        durationMs: clip.end_ms - clip.start_ms,
      };
      if (clip.status !== "ready") return clipJson(metadata);
      const expectedPath = `recording-clips/${clip.id}/${clip.attempt_id}.mp4`;
      if (clip.output_path !== expectedPath) throw new Error("Invalid clip output");
      const env = getR2RecordingEnvironment();
      const url = await createR2PresignedUrl(env, "GET", expectedPath, { expiresInSeconds: 300 });
      const downloadUrl = await createR2PresignedUrl(env, "GET", expectedPath, {
        expiresInSeconds: 300,
        query: { "response-content-disposition": buildDownloadContentDisposition("clip.mp4") },
      });
      return clipJson({ ...metadata, url, downloadUrl });
    }
    if (
      !["status", "retry", "delete"].includes(String(action)) ||
      typeof body.id !== "string" ||
      !clipUuid.test(body.id)
    )
      throw new ClipError("Invalid clip request.");
    const { data: clip, error } = await admin
      .from("recording_clips")
      .select("*")
      .eq("id", body.id)
      .eq("creator_id", userId)
      .maybeSingle();
    if (error) throw new Error("Clip lookup failed");
    if (!clip) throw new ClipError("This clip is no longer available.", 404);
    if (action === "delete") {
      const { error } = await admin
        .from("recording_clips")
        .delete()
        .eq("id", clip.id)
        .eq("creator_id", userId);
      if (error) throw new Error("Clip deletion failed");
      return clipJson({ ok: true });
    }
    const source = await clipSource(admin, clip.response_id, clip.version_id, userId);
    if (source.bucket !== clip.source_bucket || source.path !== clip.source_path)
      throw new ClipError("This clip is no longer available.", 410);
    if (action === "retry" && clip.status === "failed") {
      if (clip.attempts >= 6)
        throw new ClipError(
          "This recording could not be exported. Please try a different recording.",
          422,
        );
      const { error } = await admin.rpc("retry_recording_clip", {
        p_id: clip.id,
        p_creator_id: userId,
      });
      if (error) {
        if (error.code === "P0001")
          throw new ClipError("Please wait for your current clips to finish before retrying.", 429);
        if (error.code === "22023")
          throw new ClipError(
            "This recording could not be exported. Please try a different recording.",
            422,
          );
        throw new Error("Clip retry failed");
      }
      const work = dispatchClips(admin, clip.id).catch(() => {
        console.error("Clip dispatch deferred");
      });
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
      else await work;
      return clipJson({ ok: true, id: clip.id, status: "pending" });
    }
    return clipJson({ ok: true, id: clip.id, status: clip.status });
  }),
);
