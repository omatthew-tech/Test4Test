import type { SupabaseClient } from "@supabase/supabase-js";

export class RecordingTranscriptError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sourceColumns = "recording_bucket, recording_path, recording_deleted_at";
const transcriptColumns =
  "id, response_id, owner_user_id, source_bucket, source_path, status, language, full_text, segments, updated_at";
const missingSchema = (code?: string) =>
  ["PGRST205", "42P01", "42703", "PGRST204"].includes(code ?? "");

/** Only app owners may read transcripts. Never substitute another recording version. */
async function readSource(
  admin: SupabaseClient,
  userId: string,
  responseId: string,
  versionId?: string,
) {
  const response = await admin
    .from("test_responses")
    .select(`submission_id, ${sourceColumns}`)
    .eq("id", responseId)
    .maybeSingle();
  if (response.error) throw new Error("Recording lookup failed");
  if (!response.data) throw new RecordingTranscriptError("Recording unavailable.", 404);
  const owner = await admin
    .from("submissions")
    .select("user_id")
    .eq("id", response.data.submission_id)
    .maybeSingle();
  if (owner.error) throw new Error("Owner lookup failed");
  if (owner.data?.user_id !== userId)
    throw new RecordingTranscriptError("Recording unavailable.", 404);
  let source = response.data;
  if (versionId) {
    const version = await admin
      .from("test_response_versions")
      .select(sourceColumns)
      .eq("response_id", responseId)
      .eq("id", versionId)
      .maybeSingle();
    if (version.error && !missingSchema(version.error.code))
      throw new Error("Version lookup failed");
    if (version.error || !version.data)
      throw new RecordingTranscriptError("Recording version unavailable.", 404);
    source = { ...source, ...version.data };
  }
  if (source.recording_deleted_at || !source.recording_bucket || !source.recording_path)
    throw new RecordingTranscriptError("Recording unavailable.", 404);
  return { bucket: source.recording_bucket as string, path: source.recording_path as string };
}

export async function readRecordingTranscript(
  admin: SupabaseClient,
  userId: string,
  responseId: string,
  versionId?: string,
) {
  const source = await readSource(admin, userId, responseId, versionId);
  const query = () => {
    let builder = admin
      .from("recording_transcripts")
      .select(transcriptColumns)
      .eq("response_id", responseId)
      .eq("owner_user_id", userId)
      .eq("source_bucket", source.bucket)
      .eq("source_path", source.path);
    if (versionId) builder = builder.eq("version_id", versionId);
    return builder.maybeSingle();
  };
  const result = await query();
  if (result.error) {
    if (versionId && missingSchema(result.error.code))
      throw new RecordingTranscriptError("Recording version unavailable.", 404);
    throw new Error("Transcript lookup failed");
  }
  const row = result.data;
  if (!row) return { transcript: null };
  const words: Array<{
    id: string;
    sequence: number;
    segmentIndex: number;
    startMs: number;
    endMs: number;
    text: string;
  }> = [];
  if (row.status === "ready") {
    let after = -1;
    // Keyset pagination avoids Supabase's row limit and keeps ordering stable.
    while (true) {
      const page = await admin
        .from("transcript_words")
        .select("id, sequence, segment_index, start_ms, end_ms, text")
        .eq("transcript_id", row.id)
        .gt("sequence", after)
        .order("sequence")
        .limit(500);
      if (page.error) throw new Error("Transcript words lookup failed");
      if (!page.data?.length) break;
      for (const word of page.data)
        words.push({
          id: word.id,
          sequence: word.sequence,
          segmentIndex: word.segment_index,
          startMs: word.start_ms,
          endMs: word.end_ms,
          text: word.text,
        });
      const next = page.data[page.data.length - 1].sequence as number;
      if (next <= after) throw new Error("Transcript pagination did not advance");
      after = next;
    }
  }
  const freshSource = await readSource(admin, userId, responseId, versionId);
  const fresh = await query();
  if (fresh.error) throw new Error("Transcript verification failed");
  if (
    freshSource.bucket !== source.bucket ||
    freshSource.path !== source.path ||
    fresh.data?.id !== row.id ||
    fresh.data?.updated_at !== row.updated_at ||
    fresh.data?.status !== row.status
  )
    throw new RecordingTranscriptError("The recording changed. Reload the transcript.", 409);
  return {
    transcript: {
      id: row.id,
      responseId,
      versionId,
      source,
      status: row.status,
      language: row.language,
      fullText: row.status === "ready" ? row.full_text : "",
      segments: row.status === "ready" ? row.segments : [],
      words,
      revision: row.updated_at,
    },
  };
}

/** Omit the optional argument on older backends; never retry a different explicit version. */
export async function retryCompatibleTranscript(
  admin: Pick<SupabaseClient, "rpc">,
  userId: string,
  responseId: string,
  versionId?: string,
) {
  let result = await admin.rpc("retry_recording_transcript", {
    p_owner: userId,
    p_response_id: responseId,
    p_version_id: versionId ?? null,
  });
  if (!versionId && result.error && ["PGRST202", "42883"].includes(result.error.code)) {
    result = await admin.rpc("retry_recording_transcript", {
      p_owner: userId,
      p_response_id: responseId,
    });
  }
  if (result.error) throw new Error("Transcript retry failed");
  return Boolean(result.data);
}
