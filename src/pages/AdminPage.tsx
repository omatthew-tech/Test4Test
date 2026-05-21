import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, ShieldAlert, XCircle } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime } from "../lib/format";
import {
  AdminReportsResult,
  decideAdminTestReport,
  loadAdminTestReports,
  restoreReportedSubmission,
} from "../lib/testReports";
import { AdminReviewSubmission, AdminTestReport } from "../types";

type AdminAction = `report:${string}:ok` | `report:${string}:not_ok` | `restore:${string}`;
type PendingReportDecision = { reportId: string; decision: "ok" | "not_ok" } | null;

function reportStatusLabel(status: AdminTestReport["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed problem";
    case "dismissed":
      return "Dismissed";
    default:
      return status;
  }
}

function appStatusLabel(status: AdminTestReport["appStatus"]) {
  switch (status) {
    case "live":
      return "Live";
    case "pending_verification":
      return "Pending verification";
    case "paused":
      return "Paused";
    case "flagged":
      return "Flagged";
    default:
      return "Draft";
  }
}

function compareReports(first: AdminTestReport, second: AdminTestReport) {
  if (first.status !== second.status) {
    if (first.status === "pending") {
      return -1;
    }

    if (second.status === "pending") {
      return 1;
    }
  }

  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}

export function AdminPage() {
  const { currentUser, isConfigured, isLoading } = useAppState();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const focusedReportId = searchParams.get("report")?.trim() ?? "";
  const [reports, setReports] = useState<AdminTestReport[]>([]);
  const [reviewSubmissions, setReviewSubmissions] = useState<AdminReviewSubmission[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeAction, setActiveAction] = useState<AdminAction | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingReportDecision>(null);

  const sortedReports = useMemo(() => {
    const next = [...reports].sort(compareReports);

    if (!focusedReportId) {
      return next;
    }

    return next.sort((first, second) => {
      if (first.id === focusedReportId) {
        return -1;
      }

      if (second.id === focusedReportId) {
        return 1;
      }

      return 0;
    });
  }, [focusedReportId, reports]);

  const returnTo = `${location.pathname}${location.search}`;
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;

  const applyAdminResult = (result: AdminReportsResult) => {
    setReports(result.reports);
    setReviewSubmissions(result.reviewSubmissions);

    if (result.message) {
      setNotice(result.message);
    }
  };

  const loadReports = async () => {
    if (!currentUser || !isConfigured) {
      return;
    }

    setIsLoadingReports(true);
    setLoadError("");

    try {
      applyAdminResult(await loadAdminTestReports());
    } catch (error) {
      setReports([]);
      setReviewSubmissions([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Admin reports could not be loaded.",
      );
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [currentUser?.id, isConfigured]);

  const decideReport = async (reportId: string, decision: "ok" | "not_ok") => {
    const actionKey: AdminAction = `report:${reportId}:${decision}`;
    setActiveAction(actionKey);
    setLoadError("");
    setNotice("");

    try {
      applyAdminResult(await decideAdminTestReport(reportId, decision));
      setPendingDecision(null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "That decision could not be saved.",
      );
    } finally {
      setActiveAction(null);
    }
  };

  const restoreSubmission = async (submissionId: string) => {
    const actionKey: AdminAction = `restore:${submissionId}`;
    setActiveAction(actionKey);
    setLoadError("");
    setNotice("");

    try {
      applyAdminResult(await restoreReportedSubmission(submissionId));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "That app could not be restored.",
      );
    } finally {
      setActiveAction(null);
    }
  };

  if (isLoading) {
    return null;
  }

  if (!currentUser) {
    return (
      <AppShell title="Admin" eyebrowLabel={null}>
        <div className="page-stack admin-page">
          <Surface>
            <div className="empty-state">
              <ShieldAlert size={24} />
              <h3>Sign in with the support account</h3>
              <p>Admin reports are only available to configured support users.</p>
              <Link to={signInHref} className="button button--primary">Sign in</Link>
            </div>
          </Surface>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin" description="Review reported tests and restore edited apps." eyebrowLabel={null}>
      <div className="page-stack admin-page">
        {loadError ? (
          <Surface className="callout callout--warning">
            <ShieldAlert size={18} />
            <span>{loadError}</span>
          </Surface>
        ) : null}

        {notice ? (
          <Surface className="callout callout--soft">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
          </Surface>
        ) : null}

        {isLoadingReports ? (
          <Surface>
            <div className="empty-state">
              <h3>Loading reports</h3>
              <p>Checking the latest test reports and apps waiting for review.</p>
            </div>
          </Surface>
        ) : null}

        {reviewSubmissions.length > 0 ? (
          <Surface className="admin-review-panel">
            <div className="section-heading">
              <span className="eyebrow">Pending verification</span>
              <h2>Edited apps ready to restore</h2>
            </div>
            <div className="admin-review-list">
              {reviewSubmissions.map((submission) => (
                <div key={submission.submissionId} className="admin-review-row">
                  <div>
                    <strong>{submission.appName}</strong>
                    <p>
                      {submission.founderDisplayName} / {submission.founderEmail} / Last report: {submission.reasonLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void restoreSubmission(submission.submissionId)}
                    disabled={activeAction === `restore:${submission.submissionId}`}
                  >
                    Restore live
                  </button>
                </div>
              ))}
            </div>
          </Surface>
        ) : null}

        {sortedReports.length > 0 ? (
          <div className="admin-report-list">
            {sortedReports.map((report) => (
              <AdminReportCard
                key={report.id}
                report={report}
                isFocused={report.id === focusedReportId}
                activeAction={activeAction}
                pendingDecision={pendingDecision}
                onRequestDecision={setPendingDecision}
                onCancelDecision={() => setPendingDecision(null)}
                onDecide={decideReport}
              />
            ))}
          </div>
        ) : !isLoadingReports && !loadError ? (
          <Surface>
            <div className="empty-state">
              <CheckCircle2 size={24} />
              <h3>No test reports</h3>
              <p>New app reports will appear here when testers submit them.</p>
            </div>
          </Surface>
        ) : null}
      </div>
    </AppShell>
  );
}

function AdminReportCard({
  report,
  isFocused,
  activeAction,
  pendingDecision,
  onRequestDecision,
  onCancelDecision,
  onDecide,
}: {
  report: AdminTestReport;
  isFocused: boolean;
  activeAction: AdminAction | null;
  pendingDecision: PendingReportDecision;
  onRequestDecision: (decision: Exclude<PendingReportDecision, null>) => void;
  onCancelDecision: () => void;
  onDecide: (reportId: string, decision: "ok" | "not_ok") => Promise<void>;
}) {
  const isPending = report.status === "pending";
  const activePendingDecision =
    pendingDecision?.reportId === report.id ? pendingDecision.decision : null;
  const isWorkingOnThisReport =
    activeAction === `report:${report.id}:ok` ||
    activeAction === `report:${report.id}:not_ok`;

  return (
    <Surface className={`admin-report-card${isFocused ? " admin-report-card--focused" : ""}`}>
      <div className="admin-report-card__header">
        <div>
          <div className="admin-report-card__meta">
            <span className={`submission-status submission-status--${report.appStatus}`}>
              <span className="submission-status__dot" />
              {appStatusLabel(report.appStatus)}
            </span>
            <span className={`admin-report-card__status admin-report-card__status--${report.status}`}>
              {reportStatusLabel(report.status)}
            </span>
          </div>
          <h2>{report.appName}</h2>
          <p>{report.reasonLabel} / Reported {formatDateTime(report.createdAt)}</p>
        </div>
        <div className="admin-report-card__actions">
          {isPending ? (
            activePendingDecision ? (
              <div className="admin-report-card__confirm">
                <p>
                  {activePendingDecision === "ok"
                    ? "Confirm this test is OK? The reporter will be emailed and the app will stay live."
                    : "Confirm this test is not OK? The app will be paused, the reporter will get a credit, and both users will be emailed."}
                </p>
                <div className="inline-actions inline-actions--compact">
                  <button
                    type="button"
                    className={activePendingDecision === "ok" ? "button button--primary" : "button button--danger"}
                    onClick={() => void onDecide(report.id, activePendingDecision)}
                    disabled={activeAction !== null}
                  >
                    {isWorkingOnThisReport ? (
                      <span className="button__spinner" aria-hidden="true" />
                    ) : activePendingDecision === "ok" ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <XCircle size={16} />
                    )}
                    {activePendingDecision === "ok" ? "Confirm test is OK" : "Confirm not OK"}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={onCancelDecision}
                    disabled={activeAction !== null}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => onRequestDecision({ reportId: report.id, decision: "ok" })}
                  disabled={activeAction !== null}
                >
                  <CheckCircle2 size={16} />
                  Test is OK
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => onRequestDecision({ reportId: report.id, decision: "not_ok" })}
                  disabled={activeAction !== null}
                >
                  <XCircle size={16} />
                  Not OK
                </button>
              </>
            )
          ) : (
            <span className="pill">
              {report.decidedAt ? `Decided ${formatDateTime(report.decidedAt)}` : "Decided"}
            </span>
          )}
        </div>
      </div>

      <div className="admin-report-card__grid">
        <div>
          <span className="eyebrow">Reporter</span>
          <p>{report.reporterDisplayName}</p>
          <a href={`mailto:${report.reporterEmail}`}>{report.reporterEmail}</a>
        </div>
        <div>
          <span className="eyebrow">Founder</span>
          <p>{report.founderDisplayName}</p>
          <a href={`mailto:${report.founderEmail}`}>{report.founderEmail}</a>
        </div>
      </div>

      {report.message ? (
        <div className="admin-report-card__message">
          <span className="eyebrow">Reporter message</span>
          <p>{report.message}</p>
        </div>
      ) : null}

      {report.accessLinks.length > 0 ? (
        <div className="admin-report-card__links">
          <span className="eyebrow">App links</span>
          <div className="inline-actions inline-actions--compact">
            {report.accessLinks.map((link) => (
              <a
                key={`${report.id}-${link.productType}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="button button--secondary button--small"
              >
                {link.productType}
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {report.decisionNote ? (
        <div className="admin-report-card__decision">
          <span className="eyebrow">Decision</span>
          <p>{report.decisionNote}</p>
          {report.decidedByEmail ? <small>By {report.decidedByEmail}</small> : null}
        </div>
      ) : null}
    </Surface>
  );
}
