import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckSquare2,
  CircleDashed,
  Eye,
  FileText,
  Square,
  Video,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Surface } from "../Layout";
import { useAppState } from "../../context/AppStateContext";
import { formatDateTime } from "../../lib/format";
import { getMySubmissions } from "../../lib/selectors";
import {
  NO_RECORDINGS_ERROR,
  generateUsabilityReport,
  listMyUsabilityReports,
  pollUsabilityReportUntilDone,
} from "../../lib/usabilityReports";
import {
  ResponseRecording,
  TestResponse,
  UsabilityReport,
  UsabilityReportPreviewFrame,
} from "../../types";
import { ProcessingScreen } from "./ProcessingScreen";
import { ReportPdfPreviewModal } from "./ReportPdfPreviewModal";

const NO_RECORDINGS_MESSAGE =
  "No usability test recordings found for this app yet. Turn on screen recording for the test and wait for testers to complete it before generating a report.";

type DashboardPhase = "dashboard" | "processing";

function isAnalyzableRecording(recording: ResponseRecording | null) {
  return Boolean(
    recording?.bucket?.trim() &&
      recording.path?.trim() &&
      !recording.deletedAt &&
      new Date(recording.expiresAt).getTime() > Date.now(),
  );
}

function formatRecordingDuration(seconds: number) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function reportStatusLabel(status: UsabilityReport["status"]) {
  switch (status) {
    case "completed":
      return "Ready";
    case "processing":
    case "pending":
      return "Processing";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function reportStatusIcon(status: UsabilityReport["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={20} strokeWidth={2.2} aria-hidden="true" />;
    case "failed":
      return <AlertCircle size={20} strokeWidth={2.2} aria-hidden="true" />;
    case "processing":
    case "pending":
    default:
      return <CircleDashed size={20} strokeWidth={2.2} aria-hidden="true" />;
  }
}

export interface ReportDashboardProps {
  /** Preselect a submission (e.g. when arriving from a submission's page). */
  initialSubmissionId?: string;
}

function ReportHistoryList({
  reports,
  emptyMessage,
  onOpen,
  onViewPdf,
}: {
  reports: UsabilityReport[];
  emptyMessage: string;
  onOpen: (reportId: string) => void;
  onViewPdf?: (report: UsabilityReport) => void;
}) {
  if (reports.length === 0) {
    return (
      <div className="empty-state empty-state--left">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="report-history">
      {reports.map((report) => {
        const isReady = report.status === "completed";

        return (
          <li
            key={report.id}
            className={`report-history__item${isReady ? " report-history__item--ready" : ""}`}
          >
            <button
              type="button"
              className="report-history__link"
              onClick={() => onOpen(report.id)}
              disabled={!isReady}
            >
              <span className="report-history__main">
                <span className="report-history__icon" aria-hidden="true">
                  <FileText size={30} strokeWidth={1.9} />
                </span>
                <span className="report-history__copy">
                  <span className="report-history__name">
                    {report.reportName || `Report ${report.reportNumber}`}
                  </span>
                  <span className="report-history__meta">
                    {report.submissionProductName} - {formatDateTime(report.createdAt)} - {report.sourceResponseCount} recording
                    {report.sourceResponseCount === 1 ? "" : "s"} analyzed
                  </span>
                </span>
              </span>
            </button>
            <span className="report-history__actions">
              {isReady && onViewPdf ? (
                <button
                  type="button"
                  className="report-history__pdf"
                  onClick={() => onViewPdf(report)}
                  aria-label={`View PDF for ${report.reportName || `Report ${report.reportNumber}`}`}
                >
                  <Eye size={19} strokeWidth={2.2} aria-hidden="true" />
                  View PDF
                </button>
              ) : (
                <span className={`report-history__status report-history__status--${report.status}`}>
                  {reportStatusIcon(report.status)}
                  {reportStatusLabel(report.status)}
                </span>
              )}
              <button
                type="button"
                className="report-history__arrow"
                onClick={() => onOpen(report.id)}
                disabled={!isReady}
                aria-label={`Open ${report.reportName || `Report ${report.reportNumber}`} online`}
              >
                <ArrowRight size={26} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ReportDashboard({ initialSubmissionId }: ReportDashboardProps) {
  const navigate = useNavigate();
  const { state } = useAppState();
  const submissions = useMemo(() => getMySubmissions(state), [state]);

  const recordingsBySubmission = useMemo(() => {
    const recordings = new Map<string, TestResponse[]>();

    for (const response of state.responses) {
      if (isAnalyzableRecording(response.recording)) {
        const submissionRecordings = recordings.get(response.submissionId) ?? [];
        submissionRecordings.push(response);
        recordings.set(response.submissionId, submissionRecordings);
      }
    }

    for (const submissionRecordings of recordings.values()) {
      submissionRecordings.sort(
        (first, second) =>
          new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime(),
      );
    }

    return recordings;
  }, [state.responses]);

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>(
    initialSubmissionId ?? submissions[0]?.id ?? "",
  );
  const [phase, setPhase] = useState<DashboardPhase>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>("");
  const [history, setHistory] = useState<UsabilityReport[]>([]);
  const [previewFrames, setPreviewFrames] = useState<UsabilityReportPreviewFrame[]>([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);
  const [reportName, setReportName] = useState("");
  const [isReportNameCustomized, setIsReportNameCustomized] = useState(false);
  const [pdfPreviewReport, setPdfPreviewReport] = useState<UsabilityReport | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedSubmissionId && submissions[0]) {
      setSelectedSubmissionId(submissions[0].id);
    }
  }, [selectedSubmissionId, submissions]);

  useEffect(() => {
    let isCancelled = false;

    listMyUsabilityReports()
      .then((reports) => {
        if (!isCancelled) {
          setHistory(reports);
        }
      })
      .catch(() => {
        // History is best-effort; a missing/undeployed endpoint shouldn't block generation.
        if (!isCancelled) {
          setHistory([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId) ?? null;
  const availableRecordings = useMemo(
    () => recordingsBySubmission.get(selectedSubmissionId) ?? [],
    [recordingsBySubmission, selectedSubmissionId],
  );
  const availableRecordingIdsKey = availableRecordings.map((response) => response.id).join(",");
  const selectedRecordingIdSet = useMemo(
    () => new Set(selectedRecordingIds),
    [selectedRecordingIds],
  );
  const selectedRecordingCount = selectedRecordingIds.length;

  useEffect(() => {
    setSelectedRecordingIds(availableRecordings.map((response) => response.id));
  }, [availableRecordingIdsKey, selectedSubmissionId]);

  const filteredHistory = useMemo(
    () =>
      history
        .filter(
          (report) =>
            report.accessRole !== "shared"
            && report.submissionId === selectedSubmissionId,
        )
        .sort((first, second) => {
          if (first.reportNumber !== second.reportNumber) {
            return second.reportNumber - first.reportNumber;
          }

          return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
        }),
    [history, selectedSubmissionId],
  );
  const sharedHistory = useMemo(
    () =>
      history
        .filter((report) => report.accessRole === "shared")
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
        ),
    [history],
  );
  const hasMultipleSubmissions = submissions.length > 1;

  function handleOpenGenerateModal() {
    const nextReportNumber =
      filteredHistory.reduce(
        (latest, report) => Math.max(latest, report.reportNumber),
        0,
      ) + 1;
    setReportName(`Report ${nextReportNumber}`);
    setIsReportNameCustomized(false);
    setError(null);
    setIsConfirmModalOpen(true);
  }

  async function handleGenerate() {
    setError(null);

    if (!selectedSubmission) {
      setError("Create and publish an app before generating a report.");
      return;
    }

    // Requirement: validate the user actually has videos before doing anything.
    if (availableRecordings.length === 0) {
      setError(NO_RECORDINGS_MESSAGE);
      return;
    }

    if (selectedRecordingCount === 0) {
      setError("Select at least one recording to generate a report.");
      return;
    }

    if (!reportName.trim()) {
      setError("Enter a report name.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewFrames([]);
    setPhase("processing");
    setStatusLabel("Fetching your usability recordings...");

    try {
      const { reportId, previewFrames: initialPreviewFrames } = await generateUsabilityReport(
        selectedSubmission.id,
        selectedRecordingIds,
        isReportNameCustomized ? reportName : undefined,
      );
      setPreviewFrames(initialPreviewFrames);

      const result = await pollUsabilityReportUntilDone(reportId, {
        signal: controller.signal,
        onTick: (status, frameCount, nextPreviewFrames) => {
          if (nextPreviewFrames.length > 0) {
            setPreviewFrames(nextPreviewFrames);
          }

          if (status === "processing" || status === "pending") {
            setStatusLabel(
              frameCount > 0
                ? `Captured ${frameCount} unique screen${frameCount === 1 ? "" : "s"} so far...`
                : "Scanning each recording for unique app pages...",
            );
          }
        },
      });

      if (result.status === "completed") {
        // Requirement: redirect to the specific report view on success.
        navigate(`/ai-analysis/${reportId}`);
        return;
      }

      setError(result.errorMessage ?? "We couldn't finish this report. Please try again.");
      setPhase("dashboard");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }

      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setError(message === NO_RECORDINGS_ERROR ? NO_RECORDINGS_MESSAGE : message);
      setPreviewFrames([]);
      setPhase("dashboard");
    } finally {
      abortRef.current = null;
    }
  }

  if (phase === "processing") {
    return (
      <ProcessingScreen
        productName={selectedSubmission?.productName}
        statusLabel={statusLabel}
        screenshots={previewFrames}
      />
    );
  }

  return (
    <div className="report-dashboard page-stack">
      <Surface className="report-dashboard__hero">
        <div className="report-dashboard__hero-text">
          <h2 className="report-dashboard__title">Generate report</h2>
          <p className="report-dashboard__subtitle">
            Let AI analyze every user recording for new insights, quick fixes and in-depth
            feedback. See exactly what your users see and what they have to say about it.
          </p>
        </div>

        {submissions.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} strokeWidth={1.8} />
            <p>You don't have any apps yet. Submit an app to start collecting recordings.</p>
          </div>
        ) : (
          <div className="report-dashboard__controls">
            {hasMultipleSubmissions ? (
              <label className="field report-dashboard__select">
                <span className="field__label">App</span>
                <select
                  value={selectedSubmissionId}
                  onChange={(event) => {
                    setSelectedSubmissionId(event.target.value);
                    setError(null);
                  }}
                >
                  {submissions.map((submission) => {
                    const count = recordingsBySubmission.get(submission.id)?.length ?? 0;
                    return (
                      <option key={submission.id} value={submission.id}>
                        {submission.productName} ({count} recording{count === 1 ? "" : "s"})
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <div className="report-dashboard__selected-app">
                <span className="field__label">App</span>
                <strong>{selectedSubmission?.productName}</strong>
              </div>
            )}

            <button
              type="button"
              className="button button--primary report-dashboard__generate"
              onClick={handleOpenGenerateModal}
              disabled={!selectedSubmission || availableRecordings.length === 0}
            >
              Generate report
              <ArrowRight size={18} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {error ? (
          <div className="callout callout--warning report-dashboard__error" role="alert">
            <AlertTriangle size={18} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        ) : null}
      </Surface>

      {isConfirmModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal report-recording-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-report-confirm-title"
          >
            <h3 id="generate-report-confirm-title">Generate a new report</h3>
            <p>
              Choose which tester videos AI should analyze for {selectedSubmission?.productName}.
            </p>
            <label className="field report-recording-modal__name">
              <span className="field__label">Report name</span>
              <input
                type="text"
                value={reportName}
                maxLength={100}
                autoFocus
                onChange={(event) => {
                  setReportName(event.target.value);
                  setIsReportNameCustomized(true);
                  setError(null);
                }}
                placeholder="Report name"
              />
            </label>
            <div className="report-recording-modal__toolbar">
              <strong>
                {selectedRecordingCount} of {availableRecordings.length} selected
              </strong>
              <button
                type="button"
                className="report-recording-modal__select-all"
                onClick={() =>
                  setSelectedRecordingIds(
                    selectedRecordingCount === availableRecordings.length
                      ? []
                      : availableRecordings.map((response) => response.id),
                  )
                }
              >
                {selectedRecordingCount === availableRecordings.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="report-recording-modal__list" role="group" aria-label="Recordings to analyze">
              {availableRecordings.map((response) => {
                const isSelected = selectedRecordingIdSet.has(response.id);

                return (
                  <label
                    key={response.id}
                    className={`report-recording-option${isSelected ? " report-recording-option--selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedRecordingIds((current) =>
                          current.includes(response.id)
                            ? current.filter((id) => id !== response.id)
                            : [...current, response.id],
                        );
                        setError(null);
                      }}
                    />
                    <span className="report-recording-option__check" aria-hidden="true">
                      {isSelected ? <CheckSquare2 size={22} /> : <Square size={22} />}
                    </span>
                    <span className="report-recording-option__copy">
                      <strong>{response.anonymousLabel || "Anonymous tester"}</strong>
                      <span>
                        {formatDateTime(response.submittedAt)} · {formatRecordingDuration(response.durationSeconds)}
                      </span>
                    </span>
                    <Video size={20} aria-hidden="true" />
                  </label>
                );
              })}
            </div>
            {selectedRecordingCount === 0 ? (
              <p className="report-recording-modal__validation" role="alert">
                Select at least one video to continue.
              </p>
            ) : null}
            {!reportName.trim() ? (
              <p className="report-recording-modal__validation" role="alert">
                Enter a report name to continue.
              </p>
            ) : null}
            <div className="modal__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setIsConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  void handleGenerate();
                }}
                disabled={selectedRecordingCount === 0 || !reportName.trim()}
              >
                Generate from {selectedRecordingCount} video{selectedRecordingCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submissions.length > 0 ? (
        <section className="report-dashboard__history">
          <h3 className="report-dashboard__history-title">Previous reports</h3>
          <ReportHistoryList
            reports={filteredHistory}
            emptyMessage="No reports yet for this app. Generate your first report above."
            onOpen={(reportId) => navigate(`/ai-analysis/${reportId}`)}
            onViewPdf={setPdfPreviewReport}
          />
        </section>
      ) : null}

      {sharedHistory.length > 0 ? (
        <section className="report-dashboard__history">
          <h3 className="report-dashboard__history-title">Shared with you</h3>
          <ReportHistoryList
            reports={sharedHistory}
            emptyMessage="No reports have been shared with this account."
            onOpen={(reportId) => navigate(`/ai-analysis/${reportId}`)}
          />
        </section>
      ) : null}

      {pdfPreviewReport ? (
        <ReportPdfPreviewModal
          report={pdfPreviewReport}
          onClose={() => setPdfPreviewReport(null)}
        />
      ) : null}
    </div>
  );
}
