import { UUID_PATTERN } from "../_shared/transcript-contract.ts";
import {
  TranscriptHttpError,
  transcriptHandler,
  transcriptJson,
} from "../_shared/transcript-http.ts";

Deno.serve((request) =>
  transcriptHandler(request, "owner", async ({ admin, userId, body }) => {
    if (typeof body.responseId !== "string" || !UUID_PATTERN.test(body.responseId)) {
      throw new TranscriptHttpError("Invalid recording.");
    }
    const { data, error } = await admin.rpc("retry_recording_transcript", {
      p_owner: userId,
      p_response_id: body.responseId,
    });
    if (error) throw new Error("Transcript retry failed");
    if (!data)
      throw new TranscriptHttpError(
        "This transcript is not available for retry. Refresh the report.",
        409,
      );
    return transcriptJson({ ok: true });
  }),
);
