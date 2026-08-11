import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { generateUsabilityReportPdf, PdfGenerationProgress } from "../../lib/usabilityReportPdf";
import { getUsabilityReport } from "../../lib/usabilityReports";
import type { UsabilityReport } from "../../types";

type PreviewPhase = "loading" | "ready" | "error";

interface ReportPdfPreviewModalProps {
  report: UsabilityReport;
  onClose: () => void;
}

export function ReportPdfPreviewModal({ report, onClose }: ReportPdfPreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const downloadButtonRef = useRef<HTMLButtonElement | null>(null);
  const downloadSuccessModalRef = useRef<HTMLElement | null>(null);
  const downloadAgainTimerRef = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<PreviewPhase>("loading");
  const [progress, setProgress] = useState<PdfGenerationProgress>({
    completed: 0,
    total: 1,
    message: "Loading report...",
  });
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("test4test-usability-report.pdf");
  const [warningCount, setWarningCount] = useState(0);
  const [isDownloadSuccessOpen, setIsDownloadSuccessOpen] = useState(false);
  const [downloadAgainLabel, setDownloadAgainLabel] = useState("Download again");

  const progressPercent = useMemo(
    () => Math.max(3, Math.min(100, Math.round((progress.completed / progress.total) * 100))),
    [progress],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;

      if (downloadAgainTimerRef.current !== null) {
        window.clearTimeout(downloadAgainTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (isDownloadSuccessOpen) {
        if (downloadAgainTimerRef.current !== null) {
          window.clearTimeout(downloadAgainTimerRef.current);
          downloadAgainTimerRef.current = null;
        }

        setIsDownloadSuccessOpen(false);
        setDownloadAgainLabel("Download again");
        window.setTimeout(() => downloadButtonRef.current?.focus(), 0);
        return;
      }

      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDownloadSuccessOpen, onClose]);

  useEffect(() => {
    if (isDownloadSuccessOpen) {
      downloadSuccessModalRef.current?.focus();
    }
  }, [isDownloadSuccessOpen]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let isCancelled = false;

    setPhase("loading");
    setError(null);
    setPdfUrl(null);
    setWarningCount(0);
    setProgress({ completed: 0, total: 1, message: "Loading report..." });

    void (async () => {
      try {
        const reportDetail = await getUsabilityReport(report.id, { signal: controller.signal });

        if (controller.signal.aborted) {
          return;
        }

        const onlineUrl = new URL(`/ai-analysis/${report.id}`, window.location.origin).toString();
        const generated = await generateUsabilityReportPdf(reportDetail, {
          onlineUrl,
          signal: controller.signal,
          onProgress: (nextProgress) => {
            if (!isCancelled) {
              setProgress(nextProgress);
            }
          },
        });

        if (controller.signal.aborted) {
          return;
        }

        objectUrl = URL.createObjectURL(generated.blob);
        setFilename(generated.filename);
        setWarningCount(generated.warningCount);
        setPdfUrl(objectUrl);
        setPhase("ready");
      } catch (caught) {
        if (controller.signal.aborted || isCancelled) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "The PDF preview could not be prepared. Please try again.",
        );
        setPhase("error");
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attempt, report.id]);

  const reportTitle = report.reportName || `Report ${report.reportNumber}`;

  const triggerDownload = () => {
    if (!pdfUrl) {
      return;
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = pdfUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  };

  const closeDownloadSuccess = () => {
    if (downloadAgainTimerRef.current !== null) {
      window.clearTimeout(downloadAgainTimerRef.current);
      downloadAgainTimerRef.current = null;
    }

    setIsDownloadSuccessOpen(false);
    setDownloadAgainLabel("Download again");
    window.setTimeout(() => downloadButtonRef.current?.focus(), 0);
  };

  const handleDownload = () => {
    triggerDownload();
    setDownloadAgainLabel("Download again");
    setIsDownloadSuccessOpen(true);
  };

  const handleDownloadAgain = () => {
    triggerDownload();
    setDownloadAgainLabel("Downloaded again");

    if (downloadAgainTimerRef.current !== null) {
      window.clearTimeout(downloadAgainTimerRef.current);
    }

    downloadAgainTimerRef.current = window.setTimeout(() => {
      setDownloadAgainLabel("Download again");
      downloadAgainTimerRef.current = null;
    }, 1600);
  };

  return (
    <>
      <div
        className="modal-backdrop report-pdf-preview__backdrop"
        role="presentation"
        aria-hidden={isDownloadSuccessOpen ? true : undefined}
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            onClose();
          }
        }}
      >
        <div
          className="report-pdf-preview"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-pdf-preview-title"
          aria-describedby="report-pdf-preview-description"
        >
          <header className="report-pdf-preview__header">
            <span className="report-pdf-preview__icon" aria-hidden="true">
              <FileText size={22} strokeWidth={2} />
            </span>
            <span className="report-pdf-preview__heading">
              <strong id="report-pdf-preview-title">{reportTitle}</strong>
              <span id="report-pdf-preview-description">PDF preview</span>
            </span>
            <div className="report-pdf-preview__header-actions">
              {phase === "ready" && pdfUrl ? (
                <>
                  <button
                    type="button"
                    className="button button--secondary report-pdf-preview__open"
                    onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink size={17} aria-hidden="true" />
                    Open in new tab
                  </button>
                  <button
                    ref={downloadButtonRef}
                    type="button"
                    className="button button--primary report-pdf-preview__download"
                    onClick={handleDownload}
                  >
                    <Download size={17} aria-hidden="true" />
                    Download PDF
                  </button>
                </>
              ) : null}
              <button
                ref={closeButtonRef}
                type="button"
                className="report-pdf-preview__close"
                aria-label="Close PDF preview"
                onClick={onClose}
              >
                <X size={22} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </header>

          {warningCount > 0 ? (
            <div className="report-pdf-preview__warning" role="status">
              <AlertTriangle size={17} aria-hidden="true" />
              {warningCount} screenshot{warningCount === 1 ? " was" : "s were"} unavailable and
              replaced with {warningCount === 1 ? "a placeholder" : "placeholders"}.
            </div>
          ) : null}

          <div className="report-pdf-preview__content">
            {phase === "loading" ? (
              <div className="report-pdf-preview__state" aria-live="polite">
                <LoaderCircle className="report-pdf-preview__spinner" size={36} aria-hidden="true" />
                <strong>Preparing your PDF</strong>
                <p>{progress.message}</p>
                <div
                  className="report-pdf-preview__progress"
                  role="progressbar"
                  aria-label="PDF generation progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            ) : null}

            {phase === "error" ? (
              <div className="report-pdf-preview__state report-pdf-preview__state--error" role="alert">
                <AlertTriangle size={38} aria-hidden="true" />
                <strong>We could not prepare this PDF</strong>
                <p>{error}</p>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setAttempt((current) => current + 1)}
                >
                  <RefreshCw size={17} aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : null}

            {phase === "ready" && pdfUrl ? (
              <iframe
                className="report-pdf-preview__frame"
                src={`${pdfUrl}#view=FitH`}
                title={`${reportTitle} PDF preview`}
              />
            ) : null}
          </div>
        </div>
      </div>

      {isDownloadSuccessOpen ? (
        <div
          className="modal-backdrop report-pdf-download-success__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeDownloadSuccess();
            }
          }}
        >
          <section
            ref={downloadSuccessModalRef}
            className="download-success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-success-title"
            aria-describedby="download-success-description"
            tabIndex={-1}
          >
            <button
              type="button"
              className="download-success-modal__close"
              aria-label="Close download confirmation"
              onClick={closeDownloadSuccess}
            >
              <X size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>

            <div className="download-success-modal__content" aria-live="polite">
              <span className="download-success-modal__icon" aria-hidden="true">
                <CheckCircle2 size={34} strokeWidth={2.2} />
              </span>
              <h2 id="download-success-title">PDF downloaded</h2>
              <p id="download-success-description" className="download-success-modal__lead">
                Your usability report is ready to review, save, or share with your team.
              </p>

              <div className="download-success-modal__file">
                <span className="download-success-modal__file-icon" aria-hidden="true">
                  <FileText size={23} strokeWidth={2} />
                </span>
                <span className="download-success-modal__file-copy">
                  <strong title={filename}>{filename}</strong>
                  <span>PDF report</span>
                </span>
                <span className="download-success-modal__file-status">Downloaded</span>
              </div>

              <p className="download-success-modal__hint">
                Look for the file in your browser&apos;s downloads.
              </p>

              <div className="download-success-modal__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleDownloadAgain}
                >
                  <Download size={17} aria-hidden="true" />
                  {downloadAgainLabel}
                </button>
                <button type="button" className="button button--primary" onClick={closeDownloadSuccess}>
                  Done
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
