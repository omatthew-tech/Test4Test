import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";

interface RecordingAccessRequest {
  responseId?: string;
  download?: boolean;
}

interface ResponseRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  recording_bucket: string | null;
  recording_path: string | null;
  recording_file_name: string | null;
  recording_expires_at: string | null;
  recording_deleted_at: string | null;
}

interface SubmissionRow {
  user_id: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: recordingCorsHeaders });
  }

  if (request.method !== "POST") {
    return recordingJson({ error: "Method not allowed." }, 405);
  }

  let env;

  try {
    env = getRecordingEnvironment();
  } catch (error) {
    return recordingJson({ error: error instanceof Error ? error.message : "Recording setup is incomplete." }, 500);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  const admin = createRecordingAdminClient(env);
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return recordingJson({ error: userError?.message ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as RecordingAccessRequest;
  const responseId = payload.responseId?.trim() ?? "";

  if (!responseId) {
    return recordingJson({ error: "Missing response id." }, 400);
  }

  const { data: responseRow, error: responseError } = await admin
    .from("test_responses")
    .select("id, submission_id, tester_user_id, recording_bucket, recording_path, recording_file_name, recording_expires_at, recording_deleted_at")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return recordingJson({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  const responseRecord = responseRow as ResponseRow;

  if (!responseRecord.recording_bucket || !responseRecord.recording_path || !responseRecord.recording_expires_at) {
    return recordingJson({ error: "Recording not available for this response." }, 404);
  }

  if (
    responseRecord.recording_deleted_at ||
    new Date(responseRecord.recording_expires_at).getTime() <= Date.now()
  ) {
    return recordingJson({ error: "Recording has expired." }, 410);
  }

  const { data: submissionRow, error: submissionError } = await admin
    .from("submissions")
    .select("user_id")
    .eq("id", responseRecord.submission_id)
    .single();

  if (submissionError || !submissionRow) {
    return recordingJson({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const submissionRecord = submissionRow as SubmissionRow;
  const isAllowed = user.id === responseRecord.tester_user_id || user.id === submissionRecord.user_id;

  if (!isAllowed) {
    return recordingJson({ error: "You do not have permission to access this recording." }, 403);
  }

  const signedUrlResult = await admin.storage
    .from(responseRecord.recording_bucket)
    .createSignedUrl(
      responseRecord.recording_path,
      60 * 5,
      payload.download
        ? { download: responseRecord.recording_file_name ?? "screen-recording.mp4" }
        : undefined,
    );

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    return recordingJson({ error: signedUrlResult.error?.message ?? "Recording URL could not be created." }, 502);
  }

  return recordingJson({
    ok: true,
    url: signedUrlResult.data.signedUrl,
    fileName: responseRecord.recording_file_name ?? "screen-recording.mp4",
    expiresInSeconds: 60 * 5,
  });
});
