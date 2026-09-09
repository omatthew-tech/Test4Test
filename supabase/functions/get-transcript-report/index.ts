import { decodeTranscriptCursor, UUID_PATTERN } from "../_shared/transcript-contract.ts";
import {
  TranscriptHttpError,
  transcriptHandler,
  transcriptJson,
} from "../_shared/transcript-http.ts";

Deno.serve((request) =>
  transcriptHandler(request, "owner", async ({ admin, userId, body }) => {
    if (body.appId != null && (typeof body.appId !== "string" || !UUID_PATTERN.test(body.appId))) {
      throw new TranscriptHttpError("Invalid app.");
    }
    let cursor;
    try {
      cursor = decodeTranscriptCursor(body.cursor);
    } catch {
      throw new TranscriptHttpError("Invalid report cursor.");
    }
    if (cursor && body.appId && cursor.appId !== body.appId)
      throw new TranscriptHttpError("Invalid report cursor.");
    const asOf = cursor?.asOf ?? new Date().toISOString();
    const { data, error } = await admin.rpc("get_transcript_report_page", {
      p_owner: userId,
      p_app: cursor?.appId ?? body.appId ?? null,
      p_as_of: asOf,
      p_after_time: cursor?.afterTime ?? null,
      p_after_id: cursor?.afterId ?? null,
    });
    if (error || !data) throw new Error("Report query failed");
    if ((cursor || body.appId) && !data.app)
      throw new TranscriptHttpError("This app has no available recordings.", 404);
    const hasMore = data.recordings.length > 50;
    const recordings = data.recordings.slice(0, 50);
    const last = recordings.at(-1);
    const nextCursor =
      hasMore && last
        ? btoa(
            JSON.stringify({
              appId: data.app.id,
              asOf,
              afterTime: last.submittedAt,
              afterId: last.responseId,
            }),
          )
        : null;
    return transcriptJson({ ...data, recordings, nextCursor });
  }),
);
