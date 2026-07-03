import { ArrowRight, CalendarClock, Film, Images, Loader2 } from "lucide-react";
import { UsabilityReport } from "../../types";
import { formatDateTime } from "../../lib/format";

/**
 * Presentational "Report Card" for a single usability report. Replaces the
 * dense list row with a scannable card that surfaces the key stats and a clear
 * "View report" action. Pass `onView` to wire navigation in the real app.
 */

function statusLabel(status: UsabilityReport["status"]) {
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

export interface ReportCardProps {
  report: UsabilityReport;
  onView?: (report: UsabilityReport) => void;
}

export function ReportCard({ report, onView }: ReportCardProps) {
  const isReady = report.status === "completed";
  const isFailed = report.status === "failed";
  const generatedAt = report.completedAt ?? report.createdAt;

  return (
    <article className={`report-card report-card--${report.status}`}>
      <header className="report-card__head">
        <div className="report-card__heading">
          <span className="report-card__eyebrow">Usability report</span>
          <h3 className="report-card__title">Report {report.reportNumber}</h3>
        </div>
        <span className={`report-card__badge report-card__badge--${report.status}`}>
          {(report.status === "processing" || report.status === "pending") && (
            <Loader2 size={13} strokeWidth={2.6} className="report-card__badge-spin" />
          )}
          {statusLabel(report.status)}
        </span>
      </header>

      <p className="report-card__product">{report.submissionProductName}</p>

      <dl className="report-card__stats">
        <div className="report-card__stat">
          <dt className="report-card__stat-label">
            <CalendarClock size={14} strokeWidth={2.2} />
            Generated
          </dt>
          <dd className="report-card__stat-value">{formatDateTime(generatedAt)}</dd>
        </div>
        <div className="report-card__stat">
          <dt className="report-card__stat-label">
            <Film size={14} strokeWidth={2.2} />
            Recordings
          </dt>
          <dd className="report-card__stat-value">{report.sourceResponseCount}</dd>
        </div>
        <div className="report-card__stat">
          <dt className="report-card__stat-label">
            <Images size={14} strokeWidth={2.2} />
            Screens
          </dt>
          <dd className="report-card__stat-value">{isReady ? report.frameCount : "—"}</dd>
        </div>
      </dl>

      {isFailed && report.errorMessage ? (
        <p className="report-card__error">{report.errorMessage}</p>
      ) : null}

      <footer className="report-card__footer">
        {isReady ? (
          <button
            type="button"
            className="button button--primary report-card__view"
            onClick={() => onView?.(report)}
          >
            View report
            <ArrowRight size={18} strokeWidth={2.2} />
          </button>
        ) : (
          <span className="report-card__pending">
            {isFailed ? "Report unavailable" : "Still processing…"}
          </span>
        )}
      </footer>
    </article>
  );
}
