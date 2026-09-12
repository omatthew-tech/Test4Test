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
    const knownVersions = body.knownVersions ?? {};
    if (
      typeof knownVersions !== "object" ||
      Array.isArray(knownVersions) ||
      Object.entries(knownVersions).length > 1000 ||
      Object.entries(knownVersions).some(
        ([id, revision]) =>
          !UUID_PATTERN.test(id) ||
          typeof revision !== "string" ||
          !/^[a-f0-9]{32}$/.test(revision),
      )
    ) {
      throw new TranscriptHttpError("Invalid report versions.");
    }
    const parameters = {
      p_owner: userId,
      p_app: cursor?.appId ?? body.appId ?? null,
      p_as_of: asOf,
      p_after_time: cursor?.afterTime ?? null,
      p_after_id: cursor?.afterId ?? null,
    };
    let { data, error } = await admin.rpc("get_transcript_report_page_delta", {
      ...parameters,
      p_known_versions: knownVersions,
    });
    // Keep releases compatible while the additive migration is being rolled out.
    if (error?.code === "PGRST202" || error?.code === "42883") {
      ({ data, error } = await admin.rpc("get_transcript_report_page", parameters));
    }
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
              afterId: last.versionId ?? last.responseId,
            }),
          )
        : null;
    return transcriptJson({ ...data, recordings, nextCursor });
  }),
);
