import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchClips } from "./recording-clips.ts";
import { createR2PresignedUrl, getR2RecordingEnvironment } from "./r2-recordings.ts";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void } | undefined;

async function digest(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Called only after authenticating the recording owner and resolving the exact source/version. */
export async function feedbackPreview(
  admin: SupabaseClient,
  source: {
    responseId: string;
    versionId?: string;
    ownerId: string;
    bucket: string;
    path: string;
    durationSeconds: number;
  },
) {
  const secret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET");
  if (!secret || !Deno.env.get("VIDEO_PROCESSOR_URL"))
    throw new Error("Recording previews are not configured yet.");
  const endMs = Math.min(15000, Math.floor(source.durationSeconds * 1000));
  if (!Number.isSafeInteger(endMs) || endMs < 100)
    throw new Error("Recording preview is unavailable.");
  // Reuse the durable export queue, with one idempotent private job per exact source.
  const key = await digest(JSON.stringify(["feedback-preview", source, endMs]));
  const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
  // No public capability is issued for previews. Its preimage never leaves the server.
  const tokenHash = await digest(`${secret}:feedback-preview:${key}`);
  const { data: clip, error } = await admin.rpc("create_recording_clip", {
    p_id: id,
    p_response_id: source.responseId,
    p_version_id: source.versionId ?? null,
    p_creator_id: source.ownerId,
    p_source_bucket: source.bucket,
    p_source_path: source.path,
    p_start_ms: 0,
    p_end_ms: endMs,
    p_token_hash: tokenHash,
  });
  if (error || !clip) throw new Error("Recording preview could not be prepared. Try again.");
  if (clip.status === "failed")
    throw new Error("Recording preview could not be prepared. Try again later.");
  if (clip.status !== "ready") {
    const work = dispatchClips(admin, id).catch(() => {
      console.error("Feedback preview dispatch deferred");
    });
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return { ok: true, status: "pending", previewSeconds: endMs / 1000 };
  }
  const path = `recording-clips/${id}/${clip.attempt_id}.mp4`;
  if (clip.output_path !== path || clip.start_ms !== 0 || clip.end_ms !== endMs)
    throw new Error("Recording preview is unavailable.");
  const url = await createR2PresignedUrl(getR2RecordingEnvironment(), "GET", path, {
    expiresInSeconds: 300,
  });
  return {
    ok: true,
    status: "ready",
    url,
    fileName: "feedback-preview.mp4",
    previewSeconds: endMs / 1000,
    expiresInSeconds: 300,
  };
}
