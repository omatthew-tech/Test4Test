import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, FileText, Sparkles, Video } from "lucide-react";
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
import { UsabilityReport } from "../../types";
import { ProcessingScreen } from "./ProcessingScreen";

const NO_RECORDINGS_MESSAGE =
  "No usability test recordings found for this app yet. Turn on screen recording for the test and wait for testers to complete it before generating a report.";

type DashboardPhase = "dashboard" | "processing";

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
      if (response.recording) {
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

    setPhase("processing");
    setStatusLabel("Fetching your usability recordings…");

    try {
      const { reportId } = await generateUsabilityReport(selectedSubmission.id);

      const result = await pollUsabilityReportUntilDone(reportId, {
        signal: controller.signal,
        onTick: (status, frameCount) => {
          if (status === "processing" || status === "pending") {
            setStatusLabel(
              frameCount > 0
                ? `Captured ${frameCount} unique screen${frameCount === 1 ? "" : "s"} so far…`
                : "Scanning each recording for unique app pages…",
            );
          }
        },
      });

      if (result.status === "completed") {
        // Requirement: redirect to the specific report view on success.
        navigate(`/reports/${reportId}`);
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
      />
    );
  }

  return (
    <div className="report-dashboard page-stack">
      <Surface className="report-dashboard__hero">
        <div className="report-dashboard__hero-text">
          <span className="report-dashboard__eyebrow">
            <Sparkles size={16} strokeWidth={2.4} />
            AI usability report
          </span>
          <h2 className="report-dashboard__title">Generate a usability report</h2>
          <p className="report-dashboard__subtitle">
            We analyze your testers' screen recordings and pull out every unique app page as a
            timestamped screenshot, so you can see exactly what testers saw and when.
          </p>
        </div>

        {submissions.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} strokeWidth={1.8} />
            <p>You don't have any apps yet. Submit an app to start collecting recordings.</p>
          </div>
        ) : (
          <div className="report-dashboard__controls">
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

            <div className="report-dashboard__recording-hint">
              <Video size={16} strokeWidth={2.2} />
              {selectedRecordingCount > 0
                ? `${selectedRecordingCount} recording${selectedRecordingCount === 1 ? "" : "s"} available to analyze`
                : "No recordings available for this app yet"}
            </div>

            <button
              type="button"
              className="button button--primary report-dashboard__generate"
              onClick={handleGenerate}
            >
              Generate Report
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

      <Surface className="report-dashboard__history">
        <h3 className="report-dashboard__history-title">Report history</h3>
        {history.length === 0 ? (
          <div className="empty-state empty-state--left">
            <p>No reports yet. Generate your first report above.</p>
          </div>
        ) : (
          <ul className="report-history">
            {history.map((report) => {
              const isReady = report.status === "completed";
              return (
                <li key={report.id} className="report-history__item">
                  <button
                    type="button"
                    className="report-history__link"
                    onClick={() => navigate(`/reports/${report.id}`)}
                    disabled={!isReady}
                  >
                    <span className="report-history__main">
                      <span className="report-history__name">{report.submissionProductName}</span>
                      <span className="report-history__meta">
                        {formatDateTime(report.createdAt)} · {report.frameCount} screenshot
                        {report.frameCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span
                      className={`report-history__status report-history__status--${report.status}`}
                    >
                      {reportStatusLabel(report.status)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </div>
  );
}
