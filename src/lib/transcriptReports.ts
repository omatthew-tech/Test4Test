import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";
import type {
  TranscriptReportApp,
  TranscriptReportData,
  TranscriptReportRecording,
} from "./transcriptReport";

export interface TranscriptReportPage {
  apps: TranscriptReportApp[];
  app: TranscriptReportApp | null;
  recordings: TranscriptReportRecording[];
  nextCursor: string | null;
}

async function callTranscriptEndpoint<T>(
  endpoint: string,
  body: object,
  userId: string,
  signal?: AbortSignal,
): Promise<T> {
  const client = requireSupabase();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session?.access_token || session.user.id !== userId) {
    throw new Error("Sign in again to view transcripts.");
  }
  const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Transcripts could not be loaded. Try again.");
  }
  return payload as T;
}

/** Read every page before offering export. Failed pagination never produces a partial dataset. */
export async function loadTranscriptReportPages(
  loadPage: (cursor: string | null) => Promise<TranscriptReportPage>,
) {
  let cursor: string | null = null;
  let first: TranscriptReportPage | undefined;
  const recordings = new Map<string, TranscriptReportRecording>();
  const cursors = new Set<string>();
  do {
    const page = await loadPage(cursor);
    first ??= page;
    if (page.app?.id !== first.app?.id)
      throw new Error("The selected app changed. Reload the report.");
    for (const recording of page.recordings) recordings.set(recording.responseId, recording);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor))
      throw new Error("Report pagination could not finish. Try again.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return {
    apps: first.apps,
    report: first.app
      ? ({ app: first.app, recordings: [...recordings.values()] } satisfies TranscriptReportData)
      : null,
  };
}

export function requestTranscriptReport(userId: string, appId: string | null, signal: AbortSignal) {
  return loadTranscriptReportPages((cursor) =>
    callTranscriptEndpoint<TranscriptReportPage>(
      "get-transcript-report",
      { appId, cursor },
      userId,
      signal,
    ),
  );
}

export function retryRecordingTranscript(userId: string, responseId: string, signal: AbortSignal) {
  return callTranscriptEndpoint<{ ok: true }>(
    "retry-recording-transcript",
    { responseId },
    userId,
    signal,
  );
}
