import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";
import {
  buildDownloadContentDisposition,
  createR2PresignedUrl,
  getR2RecordingEnvironment,
  r2Fetch,
} from "../_shared/r2-recordings.ts";
import {
  assertSharedRecordingSource,
  createRecordingShare,
  resolveRecordingShare,
  RecordingShareError,
  type ShareSource,
} from "../_shared/recording-share.ts";

interface RecordingAccessRequest {
  responseId?: string;
  versionId?: string;
  download?: boolean;
  action?: "share";
  shareToken?: string;
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
  product_name: string;
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
    return recordingJson(
      { error: error instanceof Error ? error.message : "Recording setup is incomplete." },
      500,
    );
  }

  const admin = createRecordingAdminClient(env);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return recordingJson({ error: "Invalid request." }, 400);
  }
  const payload = body as RecordingAccessRequest;
  let sharedSource: ShareSource | null = null;
  let userId = "";
  if (payload.shareToken !== undefined) {
    // A capability grants only playback of its own source, never another ID,
    // historical version, download operation, or creation of a new share.
    if (
      payload.responseId !== undefined ||
      payload.versionId !== undefined ||
      payload.action !== undefined ||
      payload.download !== undefined
    ) {
      return recordingJson({ error: "Invalid shared recording request." }, 400);
    }
    try {
      sharedSource = await resolveRecordingShare(admin, payload.shareToken);
    } catch (error) {
      return recordingJson(
        { error: error instanceof Error ? error.message : "Recording unavailable." },
        error instanceof RecordingShareError ? error.status : 500,
      );
    }
  } else {
    const accessToken = (request.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!accessToken) return recordingJson({ error: "Unauthorized." }, 401);
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(accessToken);
    if (error || !user) return recordingJson({ error: "Unauthorized." }, 401);
    userId = user.id;
  }
  const responseId =
    sharedSource?.response_id ??
    (typeof payload.responseId === "string" ? payload.responseId.trim() : "");

  if (!responseId) {
    return recordingJson({ error: "Missing response id." }, 400);
  }

  const { data: responseRow, error: responseError } = await admin
    .from("test_responses")
    .select(
      "id, submission_id, tester_user_id, recording_bucket, recording_path, recording_file_name, recording_expires_at, recording_deleted_at",
    )
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return recordingJson({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  let responseRecord = responseRow as ResponseRow;

  const { data: submissionRow, error: submissionError } = await admin
    .from("submissions")
    .select("user_id, product_name")
    .eq("id", responseRecord.submission_id)
    .single();

  if (submissionError || !submissionRow) {
    return recordingJson({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const submissionRecord = submissionRow as SubmissionRow;
  const isAllowed =
    sharedSource || userId === responseRecord.tester_user_id || userId === submissionRecord.user_id;

  if (!isAllowed) {
    return recordingJson({ error: "You do not have permission to access this recording." }, 403);
  }

  if (sharedSource) {
    try {
      assertSharedRecordingSource(sharedSource, responseRecord);
    } catch (error) {
      return recordingJson(
        { error: error instanceof Error ? error.message : "Recording unavailable." },
        410,
      );
    }
  }
  if (
    payload.action !== undefined &&
    (payload.action !== "share" || payload.versionId !== undefined)
  ) {
    return recordingJson({ error: "Invalid recording share request." }, 400);
  }

  if (payload.versionId !== undefined) {
    if (typeof payload.versionId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.versionId)) {
      return recordingJson({ error: "Invalid recording version." }, 400);
    }
    const { data: version, error } = await admin
      .from("test_response_versions")
      .select("recording_bucket, recording_path, recording_file_name, recording_deleted_at")
      .eq("id", payload.versionId)
      .eq("response_id", responseId)
      .maybeSingle();
    if (error || !version) return recordingJson({ error: "Recording version not found." }, 404);
    responseRecord = { ...responseRecord, ...version };
  }
  if (responseRecord.recording_deleted_at)
    return recordingJson({ error: "Recording has been deleted." }, 410);
  if (!responseRecord.recording_bucket || !responseRecord.recording_path) {
    return recordingJson({ error: "Recording not available for this response." }, 404);
  }

  if (payload.action === "share") {
    try {
      const shareToken = await createRecordingShare(admin, {
        response_id: responseId,
        recording_bucket: responseRecord.recording_bucket,
        recording_path: responseRecord.recording_path,
      });
      return recordingJson({ ok: true, shareToken });
    } catch (error) {
      return recordingJson(
        { error: error instanceof Error ? error.message : "Recording sharing is unavailable." },
        error instanceof RecordingShareError ? error.status : 500,
      );
    }
  }

  let signedUrl = "";
  const fileName = responseRecord.recording_file_name ?? "screen-recording.mp4";

  if (responseRecord.recording_bucket.startsWith("r2:")) {
    let r2Env;

    try {
      r2Env = getR2RecordingEnvironment();
    } catch (error) {
      return recordingJson(
        { error: error instanceof Error ? error.message : "R2 recording setup is incomplete." },
        500,
      );
    }

    if (responseRecord.recording_bucket !== r2Env.providerBucket) {
      return recordingJson({ error: "Recording storage bucket is not configured." }, 500);
    }

    const objectHead = await r2Fetch(r2Env, responseRecord.recording_path, { method: "HEAD" });

    if (objectHead.status === 404) {
      return recordingJson(
        {
          error:
            "Recording file was not found in Cloudflare R2. It may have been deleted from storage.",
        },
        404,
      );
    }

    if (!objectHead.ok) {
      return recordingJson({ error: "Recording file could not be verified in storage." }, 502);
    }

    signedUrl = await createR2PresignedUrl(r2Env, "GET", responseRecord.recording_path, {
      expiresInSeconds: 60 * 5,
      query: payload.download
        ? { "response-content-disposition": buildDownloadContentDisposition(fileName) }
        : undefined,
    });
  } else {
    const signedUrlResult = await admin.storage
      .from(responseRecord.recording_bucket)
      .createSignedUrl(
        responseRecord.recording_path,
        60 * 5,
        payload.download ? { download: fileName } : undefined,
      );

    if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
      return recordingJson(
        { error: signedUrlResult.error?.message ?? "Recording URL could not be created." },
        502,
      );
    }

    signedUrl = signedUrlResult.data.signedUrl;
  }

  return recordingJson({
    ok: true,
    url: signedUrl,
    fileName,
    ...(sharedSource ? { productName: submissionRecord.product_name } : {}),
    expiresInSeconds: 60 * 5,
  });
});
