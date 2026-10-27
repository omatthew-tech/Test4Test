import { receivedFeedbackAccess, type FeedbackAccess } from "../_shared/feedback-access.ts";
import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";

const RECORDING_PREVIEW_CACHE_SECONDS = 60;

interface PreviewRequest {
  responseIds?: unknown;
}

interface SubmissionRow {
  id: string;
  product_name: string;
}

interface ResponseRow {
  feedback_source: string;
  id: string;
  submission_id: string;
  submitted_at: string;
  duration_seconds: number;
  recording_bucket: string;
  recording_path: string;
  recording_expires_at: string | null;
}

function normalizeResponseIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
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
      { error: error instanceof Error ? error.message : "Preview setup is incomplete." },
      500,
    );
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

  const payload = (await request.json().catch(() => ({}))) as PreviewRequest;
  const requestedResponseIds = normalizeResponseIds(payload.responseIds);
  const { data: submissionData, error: submissionError } = await admin
    .from("submissions")
    .select("id, product_name")
    .eq("user_id", user.id);

  if (submissionError) {
    return recordingJson({ error: submissionError.message }, 500);
  }

  const submissions = (submissionData ?? []) as SubmissionRow[];
  const submissionById = new Map(submissions.map((submission) => [submission.id, submission]));
  if (submissionById.size === 0) {
    return recordingJson({
      ok: true,
      recordings: [],
      expiresInSeconds: RECORDING_PREVIEW_CACHE_SECONDS,
    });
  }

  let responseQuery = admin
    .from("test_responses")
    .select(
      "id, submission_id, feedback_source, submitted_at, duration_seconds, recording_bucket, recording_path, recording_expires_at",
    )
    .in("submission_id", [...submissionById.keys()])
    .not("recording_bucket", "is", null)
    .not("recording_path", "is", null)
    .is("recording_deleted_at", null)
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (requestedResponseIds.length > 0) {
    responseQuery = responseQuery.in("id", requestedResponseIds);
  }

  const { data: responseData, error: responseError } = await responseQuery;
  if (responseError) {
    return recordingJson({ error: responseError.message }, 500);
  }

  const allResponses = (responseData ?? []) as ResponseRow[];
  let access: Map<string, FeedbackAccess>;
  try {
    access = await receivedFeedbackAccess(
      admin,
      user.id,
      allResponses.filter((row) => row.feedback_source === "earn").map((row) => row.id),
    );
  } catch {
    return recordingJson({ error: "Feedback access could not be verified. Try again." }, 503);
  }
  const responses = allResponses.filter((row) => access.get(row.id) !== "locked");
  const lockedRecordings = allResponses
    .filter((row) => access.get(row.id) === "locked")
    .map((row) => ({
      responseId: row.id,
      submissionId: row.submission_id,
      productName: submissionById.get(row.submission_id)?.product_name ?? "Recording",
      submittedAt: row.submitted_at,
      durationSeconds: row.duration_seconds,
      feedbackAccess: "locked",
      thumbnailStatus: "ready",
      thumbnailError: null,
      thumbnail: null,
    }));
  if (responses.length === 0) {
    return recordingJson({
      ok: true,
      recordings: lockedRecordings,
      expiresInSeconds: RECORDING_PREVIEW_CACHE_SECONDS,
    });
  }

  // Ownership, deleted-source filtering, and locked-feedback handling above are unchanged.
  // Recording cards now use metadata only; no image signing, generation, or retries.
  const recordings = responses.map((response) => ({
    feedbackAccess: access.get(response.id) ?? "free",
    responseId: response.id,
    submissionId: response.submission_id,
    productName: submissionById.get(response.submission_id)?.product_name ?? "Recording",
    submittedAt: response.submitted_at,
    durationSeconds: response.duration_seconds,
    thumbnailStatus: "ready",
    thumbnailError: null,
    thumbnail: null,
  }));

  return recordingJson({
    ok: true,
    recordings: [...recordings, ...lockedRecordings].sort(
      (a, b) =>
        b.submittedAt.localeCompare(a.submittedAt) || a.responseId.localeCompare(b.responseId),
    ),
    expiresInSeconds: RECORDING_PREVIEW_CACHE_SECONDS,
  });
});
