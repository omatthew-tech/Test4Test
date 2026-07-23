import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileText,
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
import { ResponseRecording, UsabilityReport, UsabilityReportPreviewFrame } from "../../types";
import { ProcessingScreen } from "./ProcessingScreen";

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

export function ReportDashboard({ initialSubmissionId }: ReportDashboardProps) {
  const navigate = useNavigate();
  const { state } = useAppState();
  const submissions = useMemo(() => getMySubmissions(state), [state]);

  /** Count of responses that actually carry a recording, per submission. */
  const recordingCountBySubmission = useMemo(() => {
    const counts = new Map<string, number>();
    for (const response of state.responses) {
      if (isAnalyzableRecording(response.recording)) {
        counts.set(response.submissionId, (counts.get(response.submissionId) ?? 0) + 1);
      }
    }
    return counts;
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
  const selectedRecordingCount = selectedSubmission
    ? recordingCountBySubmission.get(selectedSubmission.id) ?? 0
    : 0;
  const filteredHistory = useMemo(
    () =>
      history
        .filter((report) => report.submissionId === selectedSubmissionId)
        .sort((first, second) => {
          if (first.reportNumber !== second.reportNumber) {
            return second.reportNumber - first.reportNumber;
          }

          return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
        }),
    [history, selectedSubmissionId],
  );
  const hasMultipleSubmissions = submissions.length > 1;

  async function handleGenerate() {
    setError(null);

    if (!selectedSubmission) {
      setError("Create and publish an app before generating a report.");
      return;
    }

    // Requirement: validate the user actually has videos before doing anything.
    if (selectedRecordingCount === 0) {
      setError(NO_RECORDINGS_MESSAGE);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewFrames([]);
    setPhase("processing");
    setStatusLabel("Fetching your usability recordings...");

    try {
      const { reportId, previewFrames: initialPreviewFrames } = await generateUsabilityReport(selectedSubmission.id);
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
                    const count = recordingCountBySubmission.get(submission.id) ?? 0;
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

            <div className="report-dashboard__recording-hint">
              <Video size={16} strokeWidth={2.2} />
              {selectedRecordingCount > 0
                ? `${selectedRecordingCount} recording${selectedRecordingCount === 1 ? "" : "s"} available to analyze`
                : "You don't have any recordings for this app yet"}
            </div>

            <button
              type="button"
              className="button button--primary report-dashboard__generate"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={!selectedSubmission || selectedRecordingCount === 0}
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
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-report-confirm-title"
          >
            <h3 id="generate-report-confirm-title">Generate updated report?</h3>
            <p>
              This will create a new report using the currently selected feedback.
              Feedback that has been removed will not be included in the updated AI analysis.
            </p>
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
              >
                Generate report
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submissions.length > 0 ? (
        <section className="report-dashboard__history">
          <h3 className="report-dashboard__history-title">Previous reports</h3>
          {filteredHistory.length === 0 ? (
            <div className="empty-state empty-state--left">
              <p>No reports yet for this app. Generate your first report above.</p>
            </div>
          ) : (
            <ul className="report-history">
              {filteredHistory.map((report) => {
                const isReady = report.status === "completed";
                return (
                  <li key={report.id} className="report-history__item">
                    <button
                      type="button"
                      className="report-history__link"
                      onClick={() => navigate(`/ai-analysis/${report.id}`)}
                      disabled={!isReady}
                    >
                      <span className="report-history__main">
                        <span className="report-history__icon" aria-hidden="true">
                          <FileText size={30} strokeWidth={1.9} />
                        </span>
                        <span className="report-history__copy">
                          <span className="report-history__name">Report {report.reportNumber}</span>
                          <span className="report-history__meta">
                            {formatDateTime(report.createdAt)} - {report.sourceResponseCount} recording
                            {report.sourceResponseCount === 1 ? "" : "s"} analyzed
                          </span>
                        </span>
                      </span>
                      <span className="report-history__actions">
                        <span
                          className={`report-history__status report-history__status--${report.status}`}
                        >
                          {reportStatusIcon(report.status)}
                          {reportStatusLabel(report.status)}
                        </span>
                        <span className="report-history__arrow" aria-hidden="true">
                          <ArrowRight size={26} strokeWidth={1.9} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
