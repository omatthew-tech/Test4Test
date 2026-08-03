import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquareQuote,
  RefreshCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Surface } from "../Layout";
import { quoteAnalysisPromptVersion } from "../../lib/quoteAnalysisPrompt";
import {
  analyzeUsabilityReportQuotes,
  getUsabilityReport,
  regenerateUsabilityReport,
  restoreAllUsabilityReportQuotes,
  updateUsabilityReportQuoteInclusion,
} from "../../lib/usabilityReports";
import {
  UsabilityReportDetail,
  UsabilityReportFrame,
  UsabilityReportQuote,
} from "../../types";
import { AiSuggestionCard, AiSuggestionCardPlaceholder } from "./AiSuggestionCard";
import { ProcessingScreen } from "./ProcessingScreen";

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
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [savingQuoteIds, setSavingQuoteIds] = useState<Set<string>>(() => new Set());
  const [isRestoringAll, setIsRestoringAll] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [suggestedRegenerateReportName, setSuggestedRegenerateReportName] = useState("");
  const [regenerateReportName, setRegenerateReportName] = useState("");
  const [isRegenerateReportNameCustomized, setIsRegenerateReportNameCustomized] =
    useState(false);
  const [regenerateNameError, setRegenerateNameError] = useState<string | null>(null);
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
    if (!report || report.canManage === false) {
      return;
    }

    setSuggestedRegenerateReportName(
      report.suggestedNextReportName || `Report ${report.reportNumber + 1}`,
    );
  }, [report?.canManage, report?.id, report?.reportNumber, report?.suggestedNextReportName]);

  useEffect(() => {
    if (isRegenerateModalOpen && !isRegenerateReportNameCustomized) {
      setRegenerateReportName(suggestedRegenerateReportName);
    }
  }, [
    isRegenerateModalOpen,
    isRegenerateReportNameCustomized,
    suggestedRegenerateReportName,
  ]);

  useEffect(() => {
    if (!report || report.status !== "completed" || report.canManage === false) {
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
    report?.canManage,
    report?.quoteAnalysis?.analysis?.pageInsights,
    report?.quoteAnalysis?.promptVersion,
    report?.quoteAnalysis?.status,
    report?.status,
  ]);

  useEffect(() => {
    if (!isRegenerateModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isRegenerating) {
        setIsRegenerateModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRegenerateModalOpen, isRegenerating]);

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
  const reportQuotes = report?.quotes ?? [];
  const removedQuotes = reportQuotes.filter((quote) => quote.includeInSummary === false);
  const includedQuoteCount = reportQuotes.length - removedQuotes.length;
  const linkedRemovedScreenCount = new Set(
    removedQuotes.flatMap((quote) => quote.linkedFrameId ? [quote.linkedFrameId] : []),
  ).size;
  const removedScreenCount = removedQuotes.length > 0
    ? Math.max(1, linkedRemovedScreenCount)
    : 0;
  const hasPendingSelectionSave = savingQuoteIds.size > 0 || isRestoringAll;
  const canRegenerate =
    report?.canManage !== false
    && report?.canRegenerate !== false
    && removedQuotes.length > 0
    && includedQuoteCount > 0
    && !hasPendingSelectionSave
    && !isRegenerating;

  function navigateToFrame(target: UsabilityReportFrame | null) {
    if (target) {
      navigate(`/ai-analysis/${reportId}/screens/${target.id}`);
    }
  }

  function setQuoteInclusionLocally(quoteIds: string[], includeInSummary: boolean) {
    const quoteIdSet = new Set(quoteIds);

    setReport((current) => current
      ? {
          ...current,
          quotes: (current.quotes ?? []).map((quote) =>
            quoteIdSet.has(quote.id) ? { ...quote, includeInSummary } : quote
          ),
        }
      : current
    );
  }

  async function handleQuoteInclusionChange(
    quote: UsabilityReportQuote,
    includeInSummary: boolean,
  ) {
    if (!report || savingQuoteIds.has(quote.id) || isRestoringAll) {
      return;
    }

    const previousValue = quote.includeInSummary !== false;
    setSelectionError(null);
    setQuoteInclusionLocally([quote.id], includeInSummary);
    setSavingQuoteIds((current) => {
      const next = new Set(current);
      next.add(quote.id);
      return next;
    });

    try {
      await updateUsabilityReportQuoteInclusion(report.id, quote.id, includeInSummary);
    } catch (caught) {
      setQuoteInclusionLocally([quote.id], previousValue);
      setSelectionError(
        caught instanceof Error ? caught.message : "That feedback item could not be updated.",
      );
    } finally {
      setSavingQuoteIds((current) => {
        const next = new Set(current);
        next.delete(quote.id);
        return next;
      });
    }
  }

  async function handleRestoreAll() {
    if (!report || removedQuotes.length === 0 || hasPendingSelectionSave) {
      return;
    }

    const removedQuoteIds = removedQuotes.map((quote) => quote.id);
    setSelectionError(null);
    setIsRestoringAll(true);
    setQuoteInclusionLocally(removedQuoteIds, true);

    try {
      await restoreAllUsabilityReportQuotes(report.id);
    } catch (caught) {
      setQuoteInclusionLocally(removedQuoteIds, false);
      setSelectionError(
        caught instanceof Error ? caught.message : "The removed feedback could not be restored.",
      );
    } finally {
      setIsRestoringAll(false);
    }
  }

  function handleOpenRegenerateModal() {
    if (!report) {
      return;
    }

    setRegenerateReportName(
      suggestedRegenerateReportName || `Report ${report.reportNumber + 1}`,
    );
    setIsRegenerateReportNameCustomized(false);
    setRegenerateNameError(null);
    setSelectionError(null);
    setIsRegenerateModalOpen(true);
  }

  async function handleRegenerate() {
    if (!report || !canRegenerate) {
      return;
    }

    const normalizedReportName = regenerateReportName.trim();

    if (!normalizedReportName) {
      setRegenerateNameError("Enter a report name to continue.");
      return;
    }

    if (normalizedReportName.length > 100) {
      setRegenerateNameError("Report names must be 100 characters or fewer.");
      return;
    }

    setRegenerateNameError(null);
    setSelectionError(null);
    setIsRegenerateModalOpen(false);
    setIsRegenerating(true);

    try {
      const regenerated = await regenerateUsabilityReport(
        report.id,
        isRegenerateReportNameCustomized ? normalizedReportName : undefined,
      );
      navigate(`/ai-analysis/${regenerated.reportId}`);
    } catch (caught) {
      setSelectionError(
        caught instanceof Error ? caught.message : "The updated report could not be generated.",
      );
      setIsRegenerating(false);
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

  if (isRegenerating) {
    return (
      <ProcessingScreen
        productName={report.submissionProductName}
        statusLabel="Generating a new analysis from your selected feedback..."
        screenshots={report.frames.map((candidate) => ({
          id: candidate.id,
          testResponseId: candidate.testResponseId,
          source: "worker" as const,
          url: candidate.url,
          width: candidate.width,
          height: candidate.height,
          timestampMs: candidate.timestampMs,
          frameIndex: candidate.frameIndex,
        }))}
      />
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
            {report.reportName || `Report ${report.reportNumber}`}
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
                Previous screen
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => navigateToFrame(nextFrame)}
                disabled={!nextFrame}
              >
                Next screen
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
              <h3>Tester feedback</h3>
            </header>

            {quotes.length === 0 ? (
              <div className="empty-state empty-state--left">
                <p>No transcript quotes were captured during this screen moment.</p>
              </div>
            ) : (
              <ol className="report-frame-view__quotes">
                {quotes.map((quote) => {
                  const isIncluded = quote.includeInSummary !== false;
                  const isSaving = savingQuoteIds.has(quote.id);

                  return (
                    <li
                      key={quote.id}
                      className={[
                        "report-frame-view__quote",
                        !isIncluded ? "report-frame-view__quote--removed" : "",
                        isSaving ? "report-frame-view__quote--saving" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <MessageSquareQuote size={18} strokeWidth={2.1} aria-hidden="true" />
                      <div className="report-frame-view__quote-copy">
                        <p>{quote.text}</p>
                        <span className="report-frame-view__quote-meta">
                          {quote.testerLabel?.trim() || testerLabel} · {formatTimestamp(quote.timestampMs)}
                          {!isIncluded ? (
                            <span className="report-frame-view__removed-badge">Removed</span>
                          ) : null}
                        </span>
                      </div>
                      {report.canManage !== false ? (
                        <button
                          type="button"
                          className="report-frame-view__quote-action"
                          onClick={() => void handleQuoteInclusionChange(quote, !isIncluded)}
                          disabled={isSaving || isRestoringAll}
                          aria-label={
                            isIncluded
                              ? `Remove feedback: ${quote.text}`
                              : `Restore feedback: ${quote.text}`
                          }
                        >
                          {isSaving ? (
                            <span className="button__spinner" aria-hidden="true" />
                          ) : isIncluded ? (
                            <X size={17} strokeWidth={2.1} aria-hidden="true" />
                          ) : (
                            <RefreshCcw size={16} strokeWidth={2.1} aria-hidden="true" />
                          )}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}

            {report.canManage !== false && selectionError ? (
              <div className="callout callout--warning report-frame-view__selection-error" role="alert">
                <AlertTriangle size={16} strokeWidth={2.2} />
                <span>{selectionError}</span>
              </div>
            ) : null}

            {report.canManage !== false ? (
              <footer className="report-frame-view__quotes-footer">
              <div className="report-frame-view__selection-summary">
                <p>
                  {removedQuotes.length === 0
                    ? "All feedback is currently included."
                    : includedQuoteCount === 0
                      ? report.canRegenerate === false
                        ? "Restore at least one feedback item to keep feedback in this shared report."
                        : "Restore at least one feedback item to generate a new report."
                      : report.canRegenerate === false
                        ? `${removedQuotes.length} feedback item${removedQuotes.length === 1 ? "" : "s"} removed from this shared report.`
                        : `${removedQuotes.length} feedback item${removedQuotes.length === 1 ? "" : "s"} removed across ${removedScreenCount} screen${removedScreenCount === 1 ? "" : "s"}. The new report will use everything you kept.`}
                </p>
                {removedQuotes.length > 0 ? (
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => void handleRestoreAll()}
                    disabled={hasPendingSelectionSave || isRegenerating}
                  >
                    <RefreshCcw size={15} strokeWidth={2.1} aria-hidden="true" />
                    {isRestoringAll ? "Restoring..." : "Restore all"}
                  </button>
                ) : null}
              </div>
              {report.canRegenerate !== false ? (
                <button
                  type="button"
                  className="button button--primary report-frame-view__regenerate"
                  onClick={handleOpenRegenerateModal}
                  disabled={!canRegenerate}
                >
                  <Sparkles size={17} strokeWidth={2.1} aria-hidden="true" />
                  Generate new report
                </button>
              ) : null}
              </footer>
            ) : null}
          </section>
        </div>
      </Surface>

      {isRegenerateModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isRegenerating) {
              setIsRegenerateModalOpen(false);
            }
          }}
        >
          <div
            className="modal report-regenerate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="regenerate-report-confirm-title"
          >
            <h3 id="regenerate-report-confirm-title">Generate updated report?</h3>
            <p>
              This will create a new report using the feedback you kept. Removed feedback will
              remain saved on this report, but it will not be included in the updated AI analysis.
            </p>
            <label className="field report-regenerate-modal__name">
              <span className="field__label">Report name</span>
              <input
                type="text"
                value={regenerateReportName}
                maxLength={100}
                autoFocus
                aria-invalid={Boolean(regenerateNameError)}
                aria-describedby={regenerateNameError ? "regenerate-report-name-error" : undefined}
                onChange={(event) => {
                  setRegenerateReportName(event.target.value);
                  setIsRegenerateReportNameCustomized(true);
                  setRegenerateNameError(null);
                }}
                placeholder="Report name"
              />
            </label>
            {regenerateNameError ? (
              <p
                id="regenerate-report-name-error"
                className="report-regenerate-modal__validation"
                role="alert"
              >
                {regenerateNameError}
              </p>
            ) : null}
            <div className="report-regenerate-modal__summary">
              <strong>{includedQuoteCount} kept</strong>
              <span>{removedQuotes.length} removed</span>
            </div>
            <div className="modal__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setIsRegenerateModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void handleRegenerate()}
                disabled={!canRegenerate || !regenerateReportName.trim()}
              >
                <Sparkles size={17} strokeWidth={2.1} aria-hidden="true" />
                Generate report
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
