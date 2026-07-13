import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquareQuote,
  RefreshCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Surface } from "../Layout";
import { quoteAnalysisPromptVersion } from "../../lib/quoteAnalysisPrompt";
import { analyzeUsabilityReportQuotes, getUsabilityReport } from "../../lib/usabilityReports";
import {
  UsabilityReportDetail,
  UsabilityReportFrame,
  UsabilityReportQuote,
} from "../../types";
import { AiSuggestionCard, AiSuggestionCardPlaceholder } from "./AiSuggestionCard";

function formatTimestamp(timestampMs: number) {
  const totalSeconds = Math.floor(timestampMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(timestampMs % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function frameStart(frame: UsabilityReportFrame) {
  return typeof frame.startMs === "number" ? frame.startMs : frame.timestampMs;
}

function buildFrameWindow(frame: UsabilityReportFrame, frames: UsabilityReportFrame[]) {
  const responseFrames = frames
    .filter((candidate) => candidate.testResponseId === frame.testResponseId)
    .sort((first, second) => frameStart(first) - frameStart(second));
  const frameIndex = responseFrames.findIndex((candidate) => candidate.id === frame.id);
  const nextFrame = frameIndex >= 0 ? responseFrames[frameIndex + 1] : undefined;
  const startMs = frameStart(frame);
  const explicitEndMs = typeof frame.endMs === "number" ? frame.endMs : null;
  const endMs = explicitEndMs ?? (nextFrame ? frameStart(nextFrame) : Number.POSITIVE_INFINITY);

  return {
    startMs,
    endMs: Math.max(startMs, endMs),
  };
}

function quoteOverlapsFrameWindow(
  quote: UsabilityReportQuote,
  frame: UsabilityReportFrame,
  window: { startMs: number; endMs: number },
) {
  if (quote.testResponseId !== frame.testResponseId) {
    return false;
  }

  if (quote.linkedFrameId === frame.id) {
    return true;
  }

  const quoteStartMs = typeof quote.startMs === "number" ? quote.startMs : quote.timestampMs;
  const quoteEndMs = Math.max(
    quoteStartMs + 1,
    typeof quote.endMs === "number" ? quote.endMs : quote.timestampMs + 1,
  );

  return Math.min(quoteEndMs, window.endMs) > Math.max(quoteStartMs, window.startMs);
}

interface ReportFrameViewProps {
  reportId: string;
  frameId: string;
}

export function ReportFrameView({ reportId, frameId }: ReportFrameViewProps) {
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
          setError(caught instanceof Error ? caught.message : "That screenshot could not be loaded.");
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

  const frames = report?.frames ?? [];
  const frame = frames.find((candidate) => candidate.id === frameId) ?? null;
  const frameOrdinal = frame ? frames.findIndex((candidate) => candidate.id === frame.id) + 1 : 0;
  const frameWindow = frame ? buildFrameWindow(frame, frames) : null;
  const previousFrame = frameOrdinal > 1 ? frames[frameOrdinal - 2] : null;
  const nextFrame = frameOrdinal > 0 && frameOrdinal < frames.length ? frames[frameOrdinal] : null;
  const quotes = useMemo(() => {
    if (!report || !frame || !frameWindow) {
      return [] as UsabilityReportQuote[];
    }

    return (report.quotes ?? [])
      .filter((quote) => quoteOverlapsFrameWindow(quote, frame, frameWindow))
      .sort((first, second) => first.timestampMs - second.timestampMs);
  }, [frame, frameWindow, report]);
  const pageInsight = report?.quoteAnalysis?.analysis?.pageInsights?.find(
    (insight) => insight.frameId === frameId,
  );
  const aiSuggestion = pageInsight?.suggestion?.trim() ?? "";
  const analysisStatus = report?.quoteAnalysis?.status;
  const showSuggestionPlaceholder =
    !aiSuggestion
    && (analysisStatus === "pending" || analysisStatus === "processing" || !report?.quoteAnalysis);

  function navigateToFrame(target: UsabilityReportFrame | null) {
    if (target) {
      navigate(`/ai-analysis/${reportId}/screens/${target.id}`);
    }
  }

  if (isLoading) {
    return (
      <Surface className="report-view__state">
        <span className="button__spinner" aria-hidden="true" />
        <p>Loading screenshot...</p>
      </Surface>
    );
  }

  if (error || !report || !frame || !frameWindow) {
    return (
      <Surface className="report-view__state">
        <div className="callout callout--warning" role="alert">
          <AlertTriangle size={18} strokeWidth={2.2} />
          <span>{error ?? "That screenshot could not be loaded."}</span>
        </div>
        <div className="report-view__state-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => navigate(`/ai-analysis/${reportId}`)}
          >
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to report
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

  const testerLabel = frame.testerLabel?.trim() || "Tester";

  return (
    <div className="report-frame-view page-stack">
      <Surface className="report-frame-view__card">
        <div className="report-frame-view__header">
          <button
            type="button"
            className="report-view__back"
            onClick={() => navigate(`/ai-analysis/${report.id}`)}
          >
            <ArrowLeft size={16} strokeWidth={2.2} />
            Report {report.reportNumber}
          </button>
          <div className="report-frame-view__heading-row">
            <div>
              <span className="report-frame-view__eyebrow">
                Screen {frameOrdinal} of {frames.length}
              </span>
              <h2 className="report-view__title">{testerLabel}'s feedback</h2>
            </div>
            <div className="report-frame-view__nav">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => navigateToFrame(previousFrame)}
                disabled={!previousFrame}
              >
                <ChevronLeft size={16} strokeWidth={2.2} />
                Previous
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => navigateToFrame(nextFrame)}
                disabled={!nextFrame}
              >
                Next
                <ChevronRight size={16} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>

        <div className="report-frame-view__layout">
          <div className="report-frame-view__screenshot">
            <div className="report-frame-view__image-wrap">
              <img
                className="report-frame-view__image"
                src={frame.url}
                alt={`App screen at ${formatTimestamp(frame.timestampMs)}`}
              />
              <span className="report-frame-view__timestamp">
                <Clock size={13} strokeWidth={2.4} />
                {formatTimestamp(frame.timestampMs)}
              </span>
            </div>
            {aiSuggestion ? (
              <AiSuggestionCard
                suggestion={aiSuggestion}
                screenLabel={`Screen ${frameOrdinal}`}
                variant="inline"
              />
            ) : showSuggestionPlaceholder ? (
              <AiSuggestionCardPlaceholder variant="inline" />
            ) : null}
          </div>

          <section className="report-frame-view__quotes-panel">
            <header className="report-frame-view__quotes-head">
              <h3>Quotes</h3>
            </header>

            {quotes.length === 0 ? (
              <div className="empty-state empty-state--left">
                <p>No transcript quotes were captured during this screen moment.</p>
              </div>
            ) : (
              <ol className="report-frame-view__quotes">
                {quotes.map((quote) => (
                  <li key={quote.id} className="report-frame-view__quote">
                    <MessageSquareQuote size={18} strokeWidth={2.1} aria-hidden="true" />
                    <div>
                      <p>{quote.text}</p>
                      <span>{formatTimestamp(quote.timestampMs)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Surface>
    </div>
  );
}
