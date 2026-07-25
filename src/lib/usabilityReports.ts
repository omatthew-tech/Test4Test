import {
  UsabilityReport,
  UsabilityReportDetail,
  UsabilityReportFrame,
  UsabilityReportQuoteAnalysis,
  UsabilityReportPreviewFrame,
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
  previewFrames?: UsabilityReportPreviewFrame[];
}

interface ReportStatusResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: UsabilityReportStatus;
  frameCount?: number;
  errorMessage?: string | null;
  completedAt?: string | null;
  previewFrames?: UsabilityReportPreviewFrame[];
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

interface AnalyzeQuotesResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  quoteAnalysis?: UsabilityReportQuoteAnalysis;
}

interface UpdateReportNameResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  reportId?: string;
  reportName?: string;
}

interface RegenerateReportResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  reportId?: string;
  status?: UsabilityReportStatus;
}

class FunctionCallError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "FunctionCallError";
  }
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
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  assertConfigured();

  const accessToken = await getAccessToken("Sign in to generate reports.");
  const timeoutController = options.timeoutMs ? new AbortController() : null;
  const signal = timeoutController?.signal ?? options.signal;
  let timeoutId: number | undefined;
  let removeAbortListener: (() => void) | undefined;

  if (timeoutController && options.signal) {
    if (options.signal.aborted) {
      timeoutController.abort();
    } else {
      const abort = () => timeoutController.abort();
      options.signal.addEventListener("abort", abort, { once: true });
      removeAbortListener = () => options.signal?.removeEventListener("abort", abort);
    }
  }

  if (timeoutController && options.timeoutMs) {
    timeoutId = window.setTimeout(() => timeoutController.abort(), options.timeoutMs);
  }

  let response: Response;

  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: supabasePublishableKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (caught) {
    if (options.signal?.aborted) {
      throw new DOMException("Request aborted.", "AbortError");
    }

    if (timeoutController?.signal.aborted) {
      throw new FunctionCallError("Request timed out.");
    }

    if (caught instanceof TypeError) {
      throw new FunctionCallError(
        "The reporting service could not be reached. Please try again in a moment.",
      );
    }

    throw caught;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }

    removeAbortListener?.();
  }

  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || !payload?.ok) {
    throw new FunctionCallError(
      payload?.error ?? payload?.message ?? response.statusText,
      response.status,
    );
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
  responseIds: string[],
  reportName?: string,
): Promise<{
  reportId: string;
  status: UsabilityReportStatus;
  previewFrames: UsabilityReportPreviewFrame[];
}> {
  if (!submissionId) {
    throw new Error("Select an app to generate a report for.");
  }

  if (responseIds.length === 0) {
    throw new Error("Select at least one recording to generate a report.");
  }

  const normalizedReportName = reportName?.trim();

  if (reportName !== undefined && !normalizedReportName) {
    throw new Error("Enter a report name.");
  }

  if (normalizedReportName && normalizedReportName.length > 100) {
    throw new Error("Report names must be 100 characters or fewer.");
  }

  const payload = await callFunction<GenerateReportResponse>("generate-usability-report", {
    submissionId,
    responseIds,
    ...(normalizedReportName ? { reportName: normalizedReportName } : {}),
  });

  if (!payload.reportId) {
    throw new Error(payload.message ?? "The report could not be started.");
  }

  return {
    reportId: payload.reportId,
    status: payload.status ?? "processing",
    previewFrames: payload.previewFrames ?? [],
  };
}

/** Rename a report owned by the current user. */
export async function updateUsabilityReportName(
  reportId: string,
  reportName: string,
): Promise<string> {
  const normalizedReportName = reportName.trim();

  if (!reportId) {
    throw new Error("Missing report id.");
  }

  if (!normalizedReportName) {
    throw new Error("Enter a report name.");
  }

  if (normalizedReportName.length > 100) {
    throw new Error("Report names must be 100 characters or fewer.");
  }

  const payload = await callFunction<UpdateReportNameResponse>(
    "update-usability-report-name",
    {
      reportId,
      reportName: normalizedReportName,
    },
  );

  if (!payload.reportName) {
    throw new Error(payload.message ?? "The report name could not be updated.");
  }

  return payload.reportName;
}

/** Persist whether one quote should be used by future AI analysis. */
export async function updateUsabilityReportQuoteInclusion(
  reportId: string,
  quoteId: string,
  includeInSummary: boolean,
): Promise<boolean> {
  if (!reportId || !quoteId) {
    throw new Error("That feedback item could not be updated.");
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("usability_report_quotes")
    .update({ include_in_summary: includeInSummary })
    .eq("id", quoteId)
    .eq("report_id", reportId)
    .select("include_in_summary")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("That feedback item was not found.");
  }

  return data.include_in_summary !== false;
}

/** Restore every removed quote in a report owned by the current user. */
export async function restoreAllUsabilityReportQuotes(reportId: string): Promise<void> {
  if (!reportId) {
    throw new Error("Missing report id.");
  }

  const supabase = requireSupabase();
  const { error } = await supabase
    .from("usability_report_quotes")
    .update({ include_in_summary: true })
    .eq("report_id", reportId)
    .eq("include_in_summary", false);

  if (error) {
    throw new Error(error.message);
  }
}

/** Create a new report snapshot and analyze only the feedback kept in the source report. */
export async function regenerateUsabilityReport(
  reportId: string,
  reportName?: string,
): Promise<{ reportId: string; status: UsabilityReportStatus }> {
  if (!reportId) {
    throw new Error("Missing report id.");
  }

  const normalizedReportName = reportName?.trim();

  if (reportName !== undefined && !normalizedReportName) {
    throw new Error("Enter a report name.");
  }

  if (normalizedReportName && normalizedReportName.length > 100) {
    throw new Error("Report names must be 100 characters or fewer.");
  }

  const payload = await callFunction<RegenerateReportResponse>(
    "regenerate-usability-report",
    {
      reportId,
      ...(normalizedReportName ? { reportName: normalizedReportName } : {}),
    },
    { timeoutMs: 180000 },
  );

  if (!payload.reportId) {
    throw new Error(payload.message ?? "The updated report could not be generated.");
  }

  return {
    reportId: payload.reportId,
    status: payload.status ?? "completed",
  };
}

/** Fetch the current processing status of a report. */
export async function getUsabilityReportStatus(
  reportId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{
  status: UsabilityReportStatus;
  frameCount: number;
  errorMessage?: string | null;
  completedAt?: string | null;
  previewFrames: UsabilityReportPreviewFrame[];
}> {
  const payload = await callFunction<ReportStatusResponse>("get-usability-report-status", {
    reportId,
  }, options);

  return {
    status: payload.status ?? "processing",
    frameCount: payload.frameCount ?? 0,
    errorMessage: payload.errorMessage ?? null,
    completedAt: payload.completedAt ?? null,
    previewFrames: payload.previewFrames ?? [],
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

/** Backfill or refresh the AI-generated quote analysis for a completed report. */
export async function analyzeUsabilityReportQuotes(
  reportId: string,
  options: { force?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<UsabilityReportQuoteAnalysis> {
  const payload = await callFunction<AnalyzeQuotesResponse>(
    "analyze-usability-report-quotes",
    {
      reportId,
      ...(options.force ? { force: true } : {}),
    },
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    },
  );

  if (!payload.quoteAnalysis) {
    throw new Error(payload.message ?? "Quote analysis could not be loaded.");
  }

  return payload.quoteAnalysis;
}

export interface PollOptions {
  /** Milliseconds between status checks. Default 2500. */
  intervalMs?: number;
  /** Maximum total wait before giving up. Default 20 minutes. */
  timeoutMs?: number;
  /** Maximum wait for each individual status request. Default 15 seconds. */
  statusRequestTimeoutMs?: number;
  /** Called after every status check (useful for progress UI). */
  onTick?: (
    status: UsabilityReportStatus,
    frameCount: number,
    previewFrames: UsabilityReportPreviewFrame[],
  ) => void;
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
): Promise<{
  status: UsabilityReportStatus;
  frameCount: number;
  errorMessage?: string | null;
  previewFrames: UsabilityReportPreviewFrame[];
}> {
  const intervalMs = options.intervalMs ?? 2500;
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000;
  const statusRequestTimeoutMs = options.statusRequestTimeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException("Polling aborted.", "AbortError");
    }

    let snapshot: Awaited<ReturnType<typeof getUsabilityReportStatus>> | null = null;

    try {
      snapshot = await getUsabilityReportStatus(reportId, {
        signal: options.signal,
        timeoutMs: statusRequestTimeoutMs,
      });
    } catch (caught) {
      if (options.signal?.aborted) {
        throw new DOMException("Polling aborted.", "AbortError");
      }

      if (caught instanceof FunctionCallError && caught.status && caught.status < 500) {
        throw caught;
      }
    }

    if (snapshot) {
      options.onTick?.(snapshot.status, snapshot.frameCount, snapshot.previewFrames);

      if (snapshot.status === "completed" || snapshot.status === "failed") {
        return snapshot;
      }
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
