import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Clock, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Surface } from "../Layout";
import { formatDateTime } from "../../lib/format";
import { quoteAnalysisPromptVersion } from "../../lib/quoteAnalysisPrompt";
import { analyzeUsabilityReportQuotes, getUsabilityReport } from "../../lib/usabilityReports";
import { UsabilityReportDetail, UsabilityReportFrame } from "../../types";

/** Format an exact millisecond offset as M:SS.mmm for the timestamp badge. */
function formatTimestamp(timestampMs: number) {
  const totalSeconds = Math.floor(timestampMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(timestampMs % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

interface FrameGroup {
  responseId: string;
  label: string;
  frames: UsabilityReportFrame[];
}

export interface ReportViewProps {
  reportId: string;
}

export function ReportView({ reportId }: ReportViewProps) {
  const navigate = useNavigate();
  const [report, setReport] = useState<UsabilityReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const quoteAnalysisBackfills = useRef(new Set<string>());

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    getUsabilityReport(reportId)
      .then((detail) => {
        if (!isCancelled) {
          setReport(detail);
        }
      })
      .catch((caught: unknown) => {
        if (!isCancelled) {
          setError(caught instanceof Error ? caught.message : "That report could not be loaded.");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [reportId, reloadToken]);

  useEffect(() => {
    if (!report || report.status !== "completed") {
      return;
    }

    const analysisStatus = report.quoteAnalysis?.status;
    const hasCurrentPageInsights =
      report.quoteAnalysis?.promptVersion === quoteAnalysisPromptVersion
      && Array.isArray(report.quoteAnalysis.analysis?.pageInsights);
    if ((analysisStatus === "completed" && hasCurrentPageInsights) || analysisStatus === "processing") {
      return;
    }

    if (quoteAnalysisBackfills.current.has(report.id)) {
      return;
    }

    quoteAnalysisBackfills.current.add(report.id);

    analyzeUsabilityReportQuotes(report.id, { timeoutMs: 120000 })
      .then((quoteAnalysis) => {
        setReport((current) => current?.id === report.id ? { ...current, quoteAnalysis } : current);
      })
      .catch((caught: unknown) => {
        console.error("Failed to analyze report quotes", caught);
      });
  }, [
    report?.id,
    report?.quoteAnalysis?.analysis?.pageInsights,
    report?.quoteAnalysis?.promptVersion,
    report?.quoteAnalysis?.status,
    report?.status,
  ]);

  const groups = useMemo<FrameGroup[]>(() => {
    if (!report) {
      return [];
    }

    const byResponse = new Map<string, FrameGroup>();
    for (const frame of report.frames) {
      const existing = byResponse.get(frame.testResponseId);
      if (existing) {
        existing.frames.push(frame);
      } else {
        byResponse.set(frame.testResponseId, {
          responseId: frame.testResponseId,
          label: frame.testerLabel ?? "Tester",
          frames: [frame],
        });
      }
    }

    for (const group of byResponse.values()) {
      group.frames.sort((first, second) => first.timestampMs - second.timestampMs);
    }

    return [...byResponse.values()];
  }, [report]);
  const quoteAnalysisSummary =
    report?.quoteAnalysis?.status === "completed"
      ? report.quoteAnalysis.analysis?.summary?.trim() ?? ""
      : "";

  if (isLoading) {
    return (
      <Surface className="report-view__state">
        <span className="button__spinner" aria-hidden="true" />
        <p>Loading report...</p>
      </Surface>
    );
  }

  if (error || !report) {
    return (
      <Surface className="report-view__state">
        <div className="callout callout--warning" role="alert">
          <AlertTriangle size={18} strokeWidth={2.2} />
          <span>{error ?? "That report could not be loaded."}</span>
        </div>
        <div className="report-view__state-actions">
          <button type="button" className="button button--secondary" onClick={() => navigate("/ai-analysis")}>
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to AI Analysis
          </button>
          <button
            type="button"
            className="button button--small"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCcw size={16} strokeWidth={2.2} />
            Retry
          </button>
        </div>
      </Surface>
    );
  }

  return (
    <div className="report-view page-stack">
      <Surface className="report-view__header">
        <button type="button" className="report-view__back" onClick={() => navigate("/ai-analysis")}>
          <ArrowLeft size={16} strokeWidth={2.2} />
          AI Analysis
        </button>
        <h2 className="report-view__title">Report {report.reportNumber}</h2>
        <p className="report-view__meta">
          {report.submissionProductName} - Generated{" "}
          {report.completedAt ? formatDateTime(report.completedAt) : formatDateTime(report.createdAt)} -{" "}
          {report.sourceResponseCount} recording{report.sourceResponseCount === 1 ? "" : "s"} analyzed -{" "}
          {report.frameCount} unique screenshot{report.frameCount === 1 ? "" : "s"}
        </p>
      </Surface>

      {quoteAnalysisSummary ? (
        <Surface className="report-view__group">
          <h3 className="report-view__group-title">AI summary</h3>
          <p>{quoteAnalysisSummary}</p>
        </Surface>
      ) : null}

      {groups.length === 0 ? (
        <Surface className="report-view__group">
          <div className="empty-state empty-state--left">
            <p>This report does not have screenshots yet.</p>
          </div>
        </Surface>
      ) : (
        groups.map((group) => (
          <Surface key={group.responseId} className="report-view__group">
            <h3 className="report-view__group-title">{group.label}</h3>
            <div className="report-frames">
              {group.frames.map((frame) => (
                <figure key={frame.id} className="report-frame">
                  <button
                    type="button"
                    className="report-frame__open"
                    onClick={() => navigate(`/ai-analysis/${report.id}/screens/${frame.id}`)}
                    aria-label={`Open quotes for screen ${frame.frameIndex + 1} at ${formatTimestamp(frame.timestampMs)}`}
                  >
                    <span className="report-frame__media">
                      <img className="report-frame__image" src={frame.url} alt={`App screen at ${formatTimestamp(frame.timestampMs)}`} loading="lazy" />
                      <span className="report-frame__timestamp">
                        <Clock size={13} strokeWidth={2.4} />
                        {formatTimestamp(frame.timestampMs)}
                      </span>
                    </span>
                  </button>
                  <figcaption className="report-frame__caption">Screen {frame.frameIndex + 1}</figcaption>
                </figure>
              ))}
            </div>
          </Surface>
        ))
      )}
    </div>
  );
}
