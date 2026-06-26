import {
  UsabilityReport,
  UsabilityReportDetail,
  UsabilityReportFrame,
  UsabilityReportStatus,
} from "../types";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

/**
 * Client for the usability-report API surface.
 *
 * Mirrors the conventions used by `testReports.ts` / `recordings.ts`: get the
 * Supabase session token, then POST to the relevant Edge Function with the
 * Authorization + apikey headers.
 */

/** Sentinel error code returned when a submission has no recordings to analyze. */
export const NO_RECORDINGS_ERROR = "no_recordings";

interface GenerateReportResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  reportId?: string;
  status?: UsabilityReportStatus;
}

interface ReportStatusResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: UsabilityReportStatus;
  frameCount?: number;
  errorMessage?: string | null;
  completedAt?: string | null;
}

interface ReportDetailResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  report?: UsabilityReportDetail;
}

interface ListReportsResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  reports?: UsabilityReport[];
}

function assertConfigured() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Reporting is not available in the current environment.");
  }
}

async function getAccessToken(fallbackMessage: string) {
  const supabase = requireSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error(error?.message ?? fallbackMessage);
  }

  return session.access_token;
}

async function callFunction<T extends { ok?: boolean; error?: string; message?: string }>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  assertConfigured();

  const accessToken = await getAccessToken("Sign in to generate reports.");
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? payload?.message ?? response.statusText);
  }

  return payload;
}

/** List the current user's previously generated reports (newest first). */
export async function listMyUsabilityReports(): Promise<UsabilityReport[]> {
  const payload = await callFunction<ListReportsResponse>("list-usability-reports", {});
  return payload.reports ?? [];
}

/**
 * Kick off report generation for a submission.
 *
 * Throws an Error whose message equals `NO_RECORDINGS_ERROR` when the submission
 * has no recordings to analyze, so callers can render the specific empty-state.
 */
export async function generateUsabilityReport(
  submissionId: string,
): Promise<{ reportId: string; status: UsabilityReportStatus }> {
  if (!submissionId) {
    throw new Error("Select an app to generate a report for.");
  }

  const payload = await callFunction<GenerateReportResponse>("generate-usability-report", {
    submissionId,
  });

  if (!payload.reportId) {
    throw new Error(payload.message ?? "The report could not be started.");
  }

  return { reportId: payload.reportId, status: payload.status ?? "processing" };
}

/** Fetch the current processing status of a report. */
export async function getUsabilityReportStatus(reportId: string): Promise<{
  status: UsabilityReportStatus;
  frameCount: number;
  errorMessage?: string | null;
  completedAt?: string | null;
}> {
  const payload = await callFunction<ReportStatusResponse>("get-usability-report-status", {
    reportId,
  });

  return {
    status: payload.status ?? "processing",
    frameCount: payload.frameCount ?? 0,
    errorMessage: payload.errorMessage ?? null,
    completedAt: payload.completedAt ?? null,
  };
}

/** Fetch a completed report with all frames (each carrying a signed image URL). */
export async function getUsabilityReport(reportId: string): Promise<UsabilityReportDetail> {
  const payload = await callFunction<ReportDetailResponse>("get-usability-report", {
    reportId,
  });

  if (!payload.report) {
    throw new Error(payload.message ?? "That report could not be loaded.");
  }

  return payload.report;
}

export interface PollOptions {
  /** Milliseconds between status checks. Default 2500. */
  intervalMs?: number;
  /** Maximum total wait before giving up. Default 20 minutes. */
  timeoutMs?: number;
  /** Called after every status check (useful for progress UI). */
  onTick?: (status: UsabilityReportStatus, frameCount: number) => void;
  /** Abort polling early (e.g. component unmount). */
  signal?: AbortSignal;
}

/**
 * Poll a report until it reaches a terminal state (`completed` or `failed`),
 * times out, or is aborted. Resolves with the final status snapshot.
 */
export async function pollUsabilityReportUntilDone(
  reportId: string,
  options: PollOptions = {},
): Promise<{ status: UsabilityReportStatus; frameCount: number; errorMessage?: string | null }> {
  const intervalMs = options.intervalMs ?? 2500;
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException("Polling aborted.", "AbortError");
    }

    const snapshot = await getUsabilityReportStatus(reportId);
    options.onTick?.(snapshot.status, snapshot.frameCount);

    if (snapshot.status === "completed" || snapshot.status === "failed") {
      return snapshot;
    }

    if (Date.now() >= deadline) {
      throw new Error("This report is still processing. Check Previous reports again in a few minutes.");
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Polling aborted.", "AbortError"));
        },
        { once: true },
      );
    });
  }
}

export type { UsabilityReportFrame };
