import { ClipError, clipHandler, clipJson, clipUuid } from "../_shared/clip-http.ts";

Deno.serve((request) =>
  clipHandler(request, "worker", async ({ admin, body }) => {
    if (
      typeof body.clipId !== "string" ||
      !clipUuid.test(body.clipId) ||
      typeof body.attemptId !== "string" ||
      !clipUuid.test(body.attemptId) ||
      !["heartbeat", "completed", "failed"].includes(String(body.event))
    )
      throw new ClipError("Invalid clip callback.");
    const { data, error } = await admin.rpc("finish_recording_clip", {
      p_id: body.clipId,
      p_attempt_id: body.attemptId,
      p_event: body.event,
    });
    if (error) throw new Error("Clip completion failed");
    return clipJson({ ok: true, accepted: data === true });
  }),
);
