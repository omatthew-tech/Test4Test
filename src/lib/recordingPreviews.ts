import type { RecordingPreviewSummary, TestResponse, Submission } from "../types";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

interface PreviewEndpointResponse {
  ok?: boolean;
  recordings?: unknown;
  expiresInSeconds?: number;
  error?: string;
  message?: string;
}

interface PreviewCacheEntry {
  recordings: RecordingPreviewSummary[];
  refreshAt: number;
}

const previewCache = new Map<string, PreviewCacheEntry>();
const CACHE_EXPIRY_SAFETY_MS = 60 * 1000;
const PENDING_REFRESH_MS = 5 * 1000;

function isPreviewStatus(value: unknown): value is RecordingPreviewSummary["thumbnailStatus"] {
  return value === "pending" || value === "ready" || value === "failed";
}

function parsePreview(value: unknown): RecordingPreviewSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.responseId !== "string" ||
    typeof row.submissionId !== "string" ||
    typeof row.productName !== "string" ||
    typeof row.submittedAt !== "string" ||
    typeof row.durationSeconds !== "number" ||
    !isPreviewStatus(row.thumbnailStatus)
  ) {
    return null;
  }

  const thumbnailRow =
    row.thumbnail && typeof row.thumbnail === "object"
      ? (row.thumbnail as Record<string, unknown>)
      : null;
  const thumbnail =
    thumbnailRow && typeof thumbnailRow.url === "string"
      ? {
          url: thumbnailRow.url,
          bucket: null,
          path: null,
          contentType:
            typeof thumbnailRow.contentType === "string" ? thumbnailRow.contentType : null,
          sizeBytes: typeof thumbnailRow.sizeBytes === "number" ? thumbnailRow.sizeBytes : null,
          width: typeof thumbnailRow.width === "number" ? thumbnailRow.width : null,
          height: typeof thumbnailRow.height === "number" ? thumbnailRow.height : null,
          status: "ready" as const,
          attemptCount: null,
          lastAttemptAt: null,
          error: null,
          timestampMs:
            typeof thumbnailRow.timestampMs === "number" ? thumbnailRow.timestampMs : null,
          durationMs: typeof thumbnailRow.durationMs === "number" ? thumbnailRow.durationMs : null,
          generationVersion:
            typeof thumbnailRow.generationVersion === "string"
              ? thumbnailRow.generationVersion
              : null,
        }
      : null;

  return {
    responseId: row.responseId,
    submissionId: row.submissionId,
    productName: row.productName,
    submittedAt: row.submittedAt,
    durationSeconds: row.durationSeconds,
    thumbnailStatus: row.thumbnailStatus,
    thumbnailError: typeof row.thumbnailError === "string" ? row.thumbnailError : null,
    thumbnail,
  };
}

function cacheKey(userId: string, responseIds: string[]) {
  return `${userId}:${responseIds.length > 0 ? [...responseIds].sort().join(",") : "all"}`;
}

export async function requestRecordingPreviews(
  options: {
    force?: boolean;
    responseIds?: string[];
  } = {},
) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Recording previews are not available in the current environment.");
  }

  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token || !session.user.id) {
    throw new Error("Sign in again to view recording previews.");
  }

  const responseIds = [...new Set(options.responseIds ?? [])].filter(Boolean).slice(0, 100);
  const key = cacheKey(session.user.id, responseIds);
  const cached = previewCache.get(key);
  if (!options.force && cached && cached.refreshAt > Date.now()) {
    return cached.recordings;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/get-recording-previews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify(responseIds.length > 0 ? { responseIds } : {}),
  });
  const payload = (await response.json().catch(() => null)) as PreviewEndpointResponse | null;
  if (!response.ok || !Array.isArray(payload?.recordings)) {
    throw new Error(
      payload?.error ?? payload?.message ?? "Recording previews are not available right now.",
    );
  }

  const recordings = payload.recordings
    .map(parsePreview)
    .filter((preview): preview is RecordingPreviewSummary => preview !== null);
  const signedUrlLifetimeMs = Math.max(0, (payload.expiresInSeconds ?? 3600) * 1000);
  const hasPending = recordings.some((recording) => recording.thumbnailStatus === "pending");
  const refreshAfterMs = hasPending
    ? PENDING_REFRESH_MS
    : Math.max(PENDING_REFRESH_MS, signedUrlLifetimeMs - CACHE_EXPIRY_SAFETY_MS);
  previewCache.set(key, { recordings, refreshAt: Date.now() + refreshAfterMs });
  return recordings;
}

export function buildFixtureRecordingPreviews(
  recordings: Array<{ response: TestResponse; submission: Submission }>,
): RecordingPreviewSummary[] {
  return recordings.map(({ response, submission }) => ({
    responseId: response.id,
    submissionId: submission.id,
    productName: submission.productName,
    submittedAt: response.submittedAt,
    durationSeconds: response.durationSeconds,
    thumbnailStatus: "ready",
    thumbnailError: null,
    thumbnail: {
      url: "/blog/top-5-free-user-testing-platforms-2026/test4test-homepage.png",
      bucket: null,
      path: null,
      contentType: "image/png",
      sizeBytes: null,
      width: 960,
      height: 540,
      status: "ready",
      attemptCount: 1,
      lastAttemptAt: response.submittedAt,
      error: null,
      timestampMs: Math.round(response.durationSeconds * 550),
      durationMs: response.durationSeconds * 1000,
      generationVersion: "scene-after-half-v1",
    },
  }));
}

export function mergeRecordingPreviews(
  current: RecordingPreviewSummary[],
  updates: RecordingPreviewSummary[],
) {
  const updateById = new Map(updates.map((preview) => [preview.responseId, preview]));
  const merged = current.map((preview) => updateById.get(preview.responseId) ?? preview);
  const currentIds = new Set(current.map((preview) => preview.responseId));
  return [...merged, ...updates.filter((preview) => !currentIds.has(preview.responseId))].sort(
    (first, second) => second.submittedAt.localeCompare(first.submittedAt),
  );
}
