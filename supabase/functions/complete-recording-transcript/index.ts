import { UUID_PATTERN, validTranscriptResult } from "../_shared/transcript-contract.ts";
import {
  TranscriptHttpError,
  transcriptHandler,
  transcriptJson,
} from "../_shared/transcript-http.ts";

Deno.serve((request) =>
  transcriptHandler(request, "worker", async ({ admin, body }) => {
    if (
      typeof body.responseId !== "string" ||
      !UUID_PATTERN.test(body.responseId) ||
      typeof body.attemptId !== "string" ||
      !UUID_PATTERN.test(body.attemptId) ||
      !["heartbeat", "completed", "failed"].includes(String(body.event))
    ) {
      throw new TranscriptHttpError("Invalid transcript callback.");
    }
    if (
      body.versionId != null &&
      (typeof body.versionId !== "string" || !UUID_PATTERN.test(body.versionId))
    ) {
      throw new TranscriptHttpError("Invalid recording version.");
    }
    if (body.event === "completed" && !validTranscriptResult(body.result)) {
      throw new TranscriptHttpError("Invalid transcript result.");
    }
    const { data, error } = await admin.rpc("finish_recording_transcript", {
      p_response_id: body.responseId,
      p_attempt_id: body.attemptId,
      p_event: body.event,
      p_result: body.event === "completed" ? body.result : null,
      p_version_id: body.versionId ?? null,
    });
    if (error) throw new Error("Transcript completion failed");
    return transcriptJson({ ok: true, accepted: data === true });
  }),
);
