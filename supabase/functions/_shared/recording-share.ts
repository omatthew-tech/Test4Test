import type { SupabaseClient } from "@supabase/supabase-js";

export class RecordingShareError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface ShareSource {
  response_id: string;
  recording_bucket: string;
  recording_path: string;
}

export async function resolveRecordingShare(
  admin: SupabaseClient,
  token: unknown,
): Promise<ShareSource> {
  if (
    typeof token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  ) {
    throw new RecordingShareError("This recording link is invalid or unavailable.", 404);
  }
  const { data, error } = await admin
    .from("recording_share_links")
    .select("response_id, recording_bucket, recording_path")
    .eq("token", token)
    .maybeSingle();
  if (error)
    throw new RecordingShareError("The recording link could not be loaded. Try again.", 503);
  if (!data) throw new RecordingShareError("This recording link is invalid or unavailable.", 404);
  return data as ShareSource;
}

export function assertSharedRecordingSource(
  share: ShareSource,
  recording: {
    recording_bucket: string | null;
    recording_path: string | null;
    recording_deleted_at: string | null;
  },
) {
  if (
    recording.recording_deleted_at ||
    share.recording_bucket !== recording.recording_bucket ||
    share.recording_path !== recording.recording_path
  ) {
    throw new RecordingShareError("This shared recording is no longer available.", 410);
  }
}

/** Called only after the endpoint authenticates and authorizes the recording owner/tester. */
export async function createRecordingShare(admin: SupabaseClient, source: ShareSource) {
  const { error } = await admin.from("recording_share_links").upsert(source, {
    onConflict: "response_id,recording_bucket,recording_path",
    ignoreDuplicates: true,
  });
  if (error)
    throw new RecordingShareError("The recording link could not be created. Try again.", 503);
  const { data, error: readError } = await admin
    .from("recording_share_links")
    .select("token")
    .eq("response_id", source.response_id)
    .eq("recording_bucket", source.recording_bucket)
    .eq("recording_path", source.recording_path)
    .single();
  if (readError || !data?.token)
    throw new RecordingShareError("The recording link could not be created. Try again.", 503);
  return data.token as string;
}
