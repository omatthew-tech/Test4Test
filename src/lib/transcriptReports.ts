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

export type VersionedTranscriptRecording = TranscriptReportRecording & {
  revision?: string;
  unchanged?: boolean;
};

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
  previous?: TranscriptReportData | null,
) {
  let cursor: string | null = null;
  let first: TranscriptReportPage | undefined;
  const recordings = new Map<string, TranscriptReportRecording>();
  const cursors = new Set<string>();
  const previousById = new Map(
    previous?.recordings.map((row) => [row.versionId ?? row.responseId, row]) ?? [],
  );
  do {
    const page = await loadPage(cursor);
    first ??= page;
    if (page.app?.id !== first.app?.id)
      throw new Error("The selected app changed. Reload the report.");
    for (const recording of page.recordings as VersionedTranscriptRecording[]) {
      if (recording.unchanged) {
        const cached = previousById.get(recording.versionId ?? recording.responseId) as
          VersionedTranscriptRecording | undefined;
        if (
          previous?.app.id !== page.app?.id ||
          !cached ||
          !recording.revision ||
          cached.revision !== recording.revision
        )
          throw new Error("The report changed. Reload the report.");
        recordings.set(recording.versionId ?? recording.responseId, cached);
      } else recordings.set(recording.versionId ?? recording.responseId, recording);
    }
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

export function requestTranscriptReport(
  userId: string,
  appId: string | null,
  signal: AbortSignal,
  previous?: TranscriptReportData | null,
) {
  const knownVersions = Object.fromEntries(
    (previous?.recordings ?? [])
      .filter((row: VersionedTranscriptRecording) => Boolean(row.revision))
      .slice(0, 1000)
      .map((row: VersionedTranscriptRecording) => [row.versionId ?? row.responseId, row.revision]),
  );
  return loadTranscriptReportPages(
    (cursor) =>
      callTranscriptEndpoint<TranscriptReportPage>(
        "get-transcript-report",
        { appId, cursor, knownVersions },
        userId,
        signal,
      ),
    previous,
  );
}

export function sameTranscriptReport(
  first: TranscriptReportData | undefined,
  second: TranscriptReportData,
) {
  return Boolean(
    first &&
    JSON.stringify(first.app) === JSON.stringify(second.app) &&
    first.recordings.length === second.recordings.length &&
    first.recordings.every((row, index) => {
      const other = second.recordings[index];
      if (row === other) return true;
      const visible = (recording: VersionedTranscriptRecording) => {
        const copy = { ...recording };
        delete copy.revision;
        delete copy.unchanged;
        return copy;
      };
      return JSON.stringify(visible(row)) === JSON.stringify(visible(other));
    }),
  );
}

export function retryRecordingTranscript(
  userId: string,
  responseId: string,
  signal: AbortSignal,
  versionId?: string,
) {
  return callTranscriptEndpoint<{ ok: true }>(
    "retry-recording-transcript",
    { responseId, versionId },
    userId,
    signal,
  );
}
