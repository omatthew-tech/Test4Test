import { UUID_PATTERN } from "../_shared/transcript-contract.ts";
import { retryCompatibleTranscript } from "../_shared/recording-transcript.ts";
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
    if (
      body.versionId != null &&
      (typeof body.versionId !== "string" || !UUID_PATTERN.test(body.versionId))
    )
      throw new TranscriptHttpError("Invalid recording version.");
    const data = await retryCompatibleTranscript(
      admin,
      userId,
      body.responseId,
      body.versionId as string | undefined,
    );
    if (!data)
      throw new TranscriptHttpError(
        "This transcript is not available for retry. Refresh the report.",
        409,
      );
    return transcriptJson({ ok: true });
  }),
);
