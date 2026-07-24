import {
  enqueueWorkerReport,
  getAuthenticatedReportUser,
  getReportSupabaseEnvironment,
  getReportWorkerEnvironment,
  loadCompletedTranscriptResponseIds,
  createReportAdminClient,
  NO_RECORDINGS_ERROR,
  reportCorsHeaders,
  reportJson,
  signWorkerFrameUrls,
  workerStatusToReportStatus,
  type ReportPreviewFrame,
  type ReportWorkerEnvironment,
  type WorkerSource,
} from "../_shared/usability-reports.ts";

interface GenerateReportRequest {
  submissionId?: string;
  responseIds?: unknown;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
}

interface RecordingResponseRow {
  id: string;
  recording_bucket: string;
  recording_path: string;
  recording_thumbnail_bucket?: string | null;
  recording_thumbnail_path?: string | null;
  recording_thumbnail_content_type?: string | null;
  recording_thumbnail_size_bytes?: number | null;
  recording_thumbnail_width?: number | null;
  recording_thumbnail_height?: number | null;
}

async function responseFromAuthError(error: unknown) {
  if (error instanceof Response) {
    const payload = await error.json().catch(() => ({ error: "Unauthorized." }));
    return reportJson(payload, error.status);
  }

  return null;
}

function stripR2BucketPrefix(bucket: string) {
  return bucket.replace(/^r2:/i, "");
}

async function createSignedLegacySource(
  admin: ReturnType<typeof createReportAdminClient>,
  row: RecordingResponseRow,
) {
  const { data, error } = await admin.storage
    .from(row.recording_bucket)
    .createSignedUrl(row.recording_path, 60 * 30);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "A recording URL could not be created.");
  }

  return {
    responseId: row.id,
    url: data.signedUrl,
  } satisfies WorkerSource;
}

async function buildWorkerSources(
  admin: ReturnType<typeof createReportAdminClient>,
  rows: RecordingResponseRow[],
  cachedTranscriptResponseIds: Set<string>,
) {
  const sources: WorkerSource[] = [];

  for (const row of rows) {
    const transcriptCached = cachedTranscriptResponseIds.has(row.id);

    if (row.recording_bucket.startsWith("r2:")) {
      sources.push({
        responseId: row.id,
        objectKey: row.recording_path,
        bucket: stripR2BucketPrefix(row.recording_bucket),
        transcriptCached,
      });
      continue;
    }

    sources.push({
      ...(await createSignedLegacySource(admin, row)),
      transcriptCached,
    });
  }

  return sources;
}

async function buildInitialPreviewFrames(rows: RecordingResponseRow[], workerEnv: ReportWorkerEnvironment) {
  const thumbnailRows = rows.filter((row) => row.recording_thumbnail_bucket && row.recording_thumbnail_path);

  if (thumbnailRows.length === 0) {
    return [];
  }

  try {
    const candidates = thumbnailRows.slice(0, 8).map((row) => ({
      id: `thumbnail:${row.id}`,
      row,
    }));
    const signedUrls = await signWorkerFrameUrls(
      workerEnv,
      candidates.map((candidate) => ({
        id: candidate.id,
        bucket: candidate.row.recording_thumbnail_bucket!,
        key: candidate.row.recording_thumbnail_path!,
      })),
    );

    return candidates.flatMap(({ id, row }) => {
      const url = signedUrls.get(id);

      if (!url) {
        return [];
      }

      return [{
        id,
        testResponseId: row.id,
        source: "thumbnail",
        url,
        width: row.recording_thumbnail_width ?? null,
        height: row.recording_thumbnail_height ?? null,
        timestampMs: 0,
        frameIndex: null,
      } satisfies ReportPreviewFrame];
    });
  } catch (_error) {
    return [];
  }
}

async function createReportRow(
  admin: ReturnType<typeof createReportAdminClient>,
  submissionId: string,
  ownerUserId: string,
  sourceResponseCount: number,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: latestRows, error: latestError } = await admin
      .from("usability_reports")
      .select("report_number")
      .eq("submission_id", submissionId)
      .order("report_number", { ascending: false })
      .limit(1);

    if (latestError) {
      throw new Error(latestError.message);
    }

    const latestNumber = Number((latestRows?.[0] as { report_number?: number } | undefined)?.report_number ?? 0);
    const reportNumber = latestNumber + 1;
    const { data, error } = await admin
      .from("usability_reports")
      .insert({
        submission_id: submissionId,
        owner_user_id: ownerUserId,
        report_number: reportNumber,
        status: "pending",
        source_response_count: sourceResponseCount,
      })
      .select("id, report_number")
      .single();

    if (!error && data) {
      return data as { id: string; report_number: number };
    }

    if ((error as { code?: string } | null)?.code === "23505") {
      continue;
    }

    throw new Error(error?.message ?? "The report could not be created.");
  }

  throw new Error("The report number could not be reserved. Please try again.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: reportCorsHeaders });
  }

  if (request.method !== "POST") {
    return reportJson({ error: "Method not allowed." }, 405);
  }

  let env;

  try {
    env = getReportSupabaseEnvironment();
  } catch (error) {
    return reportJson({ error: error instanceof Error ? error.message : "AI Analysis setup is incomplete." }, 500);
  }

  const admin = createReportAdminClient(env);
  let user;

  try {
    user = await getAuthenticatedReportUser(admin, request);
  } catch (error) {
    const authResponse = await responseFromAuthError(error);
    if (authResponse) {
      return authResponse;
    }
    return reportJson({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as GenerateReportRequest;
  const submissionId = payload.submissionId?.trim() ?? "";

  if (!submissionId) {
    return reportJson({ error: "Select an app to generate a report for." }, 400);
  }

  let selectedResponseIds: string[] | null = null;

  if (payload.responseIds !== undefined) {
    if (!Array.isArray(payload.responseIds)) {
      return reportJson({ error: "Select the recordings to include in this report." }, 400);
    }

    selectedResponseIds = [
      ...new Set(
        payload.responseIds.flatMap((value) =>
          typeof value === "string" && value.trim() ? [value.trim()] : []
        ),
      ),
    ];

    if (selectedResponseIds.length === 0) {
      return reportJson({ error: "Select at least one recording to generate a report." }, 400);
    }

    if (selectedResponseIds.length !== payload.responseIds.length) {
      return reportJson({ error: "The recording selection is invalid." }, 400);
    }
  }

  const { data: submissionRow, error: submissionError } = await admin
    .from("submissions")
    .select("id, user_id, product_name")
    .eq("id", submissionId)
    .single();

  if (submissionError || !submissionRow) {
    return reportJson({ error: submissionError?.message ?? "App not found." }, 404);
  }

  const submission = submissionRow as SubmissionRow;

  if (submission.user_id !== user.id) {
    return reportJson({ error: "You do not have permission to generate a report for this app." }, 403);
  }

  const now = new Date().toISOString();
  let recordingsQuery = admin
    .from("test_responses")
    .select(`
      id,
      recording_bucket,
      recording_path,
      recording_thumbnail_bucket,
      recording_thumbnail_path,
      recording_thumbnail_content_type,
      recording_thumbnail_size_bytes,
      recording_thumbnail_width,
      recording_thumbnail_height
    `)
    .eq("submission_id", submission.id)
    .not("recording_bucket", "is", null)
    .not("recording_path", "is", null)
    .is("recording_deleted_at", null)
    .gt("recording_expires_at", now)
    .order("submitted_at", { ascending: true });

  if (selectedResponseIds) {
    recordingsQuery = recordingsQuery.in("id", selectedResponseIds);
  }

  const { data: responseRows, error: responseError } = await recordingsQuery;

  if (responseError) {
    return reportJson({ error: responseError.message }, 500);
  }

  const recordings = ((responseRows ?? []) as RecordingResponseRow[])
    .filter((row) => row.recording_bucket?.trim() && row.recording_path?.trim());

  if (recordings.length === 0) {
    return reportJson({ error: NO_RECORDINGS_ERROR, message: "This app does not have any usable recordings yet." }, 400);
  }

  if (selectedResponseIds && recordings.length !== selectedResponseIds.length) {
    return reportJson({
      error: "One or more selected recordings are no longer available for this app. Refresh the page and try again.",
    }, 400);
  }

  let cachedTranscriptResponseIds: Set<string>;

  try {
    cachedTranscriptResponseIds = await loadCompletedTranscriptResponseIds(
      admin,
      recordings.map((recording) => recording.id),
    );
  } catch (error) {
    return reportJson({ error: error instanceof Error ? error.message : "Transcript cache could not be checked." }, 500);
  }

  let report: { id: string; report_number: number };

  try {
    report = await createReportRow(admin, submission.id, user.id, recordings.length);
  } catch (error) {
    return reportJson({ error: error instanceof Error ? error.message : "The report could not be created." }, 500);
  }

  const sourceRows = recordings.map((row) => ({
    report_id: report.id,
    test_response_id: row.id,
    recording_bucket: row.recording_bucket,
    recording_path: row.recording_path,
    thumbnail_bucket: row.recording_thumbnail_bucket ?? null,
    thumbnail_path: row.recording_thumbnail_path ?? null,
    thumbnail_content_type: row.recording_thumbnail_content_type ?? null,
    thumbnail_size_bytes: row.recording_thumbnail_size_bytes ?? null,
    thumbnail_width: row.recording_thumbnail_width ?? null,
    thumbnail_height: row.recording_thumbnail_height ?? null,
  }));
  const { error: sourceError } = await admin.from("usability_report_sources").insert(sourceRows);

  if (sourceError) {
    await admin
      .from("usability_reports")
      .update({
        status: "failed",
        error_message: sourceError.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    return reportJson({ error: sourceError.message }, 500);
  }

  try {
    const workerEnv = getReportWorkerEnvironment();
    const sources = await buildWorkerSources(admin, recordings, cachedTranscriptResponseIds);
    const worker = await enqueueWorkerReport(workerEnv, report.id, sources);
    const status = workerStatusToReportStatus(worker.status);
    const { error: updateError } = await admin
      .from("usability_reports")
      .update({
        status,
        worker_job_id: worker.jobId,
        error_message: null,
      })
      .eq("id", report.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return reportJson({
      ok: true,
      reportId: report.id,
      reportNumber: report.report_number,
      status,
      previewFrames: await buildInitialPreviewFrames(recordings, workerEnv),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The video processor could not start this report.";
    await admin
      .from("usability_reports")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    return reportJson({ error: message }, 502);
  }
});
