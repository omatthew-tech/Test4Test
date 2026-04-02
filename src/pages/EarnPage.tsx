import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDate, productTypeLabel, productTypesBadges } from "../lib/format";
import { getAvailableSubmissions } from "../lib/selectors";
import { ProductType, Submission } from "../types";

function compareEarnSubmissions(first: Submission, second: Submission, sortMode: string) {
  if (first.promoted !== second.promoted) {
    return first.promoted ? -1 : 1;
  }

  if (sortMode === "newest") {
    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  }

  if (sortMode === "shortest") {
    if (first.estimatedMinutes !== second.estimatedMinutes) {
      return first.estimatedMinutes - second.estimatedMinutes;
    }

    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  }

  if (first.responseCount !== second.responseCount) {
    return first.responseCount - second.responseCount;
  }

  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}

export function EarnPage() {
  const [sortMode, setSortMode] = useState("recommended");
  const [typeFilter, setTypeFilter] = useState("all");
  const { state } = useAppState();
  const available = getAvailableSubmissions(state);

  const items = useMemo(() => {
    let next = [...available];

    if (typeFilter !== "all") {
      next = next.filter((item) => item.productTypes.includes(typeFilter as ProductType));
    }

    next.sort((first, second) => compareEarnSubmissions(first, second, sortMode));

    return next;
  }, [available, sortMode, typeFilter]);

  return (
    <AppShell
      title="Earn credits"
      description={undefined}
      eyebrowLabel={null}
    >
      <div className="page-stack earn-page">
        <Surface className="earn-controls">
          <div className="earn-controls__toolbar">
            <label className="earn-filter">
              <span className="earn-filter__label">Sort by</span>
              <div className="earn-filter__control">
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  <option value="recommended">Recommended / best fit</option>
                  <option value="newest">Newest</option>
                  <option value="shortest">Shortest estimated time</option>
                </select>
                <ChevronDown size={16} className="earn-filter__icon" aria-hidden="true" />
              </div>
            </label>
            <label className="earn-filter">
              <span className="earn-filter__label">App type</span>
              <div className="earn-filter__control">
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All apps</option>
                  <option value="website">{productTypeLabel("website")}</option>
                  <option value="ios">{productTypeLabel("ios")}</option>
                  <option value="android">{productTypeLabel("android")}</option>
                </select>
                <ChevronDown size={16} className="earn-filter__icon" aria-hidden="true" />
              </div>
            </label>
          </div>
        </Surface>

        {items.length > 0 ? (
          <div className="earn-list">
            {items.map((submission) => (
              <EarnRow key={submission.id} submission={submission} />
            ))}
          </div>
        ) : (
          <Surface>
            <div className="empty-state">
              <h3>No matching tests right now</h3>
              <p>Try a different filter or publish your own product so the exchange loop keeps moving.</p>
              <Link to="/submit" className="button button--primary">Submit your app</Link>
            </div>
          </Surface>
        )}
      </div>
    </AppShell>
  );
}

function EarnRow({
  submission,
}: {
  submission: Submission;
}) {
  return (
    <Surface className="earn-row">
      <div className="earn-row__main">
        <div className="earn-row__pills">
          {productTypesBadges(submission.productTypes).map((badge) => (
            <span key={`${submission.id}-${badge}`} className="pill pill--accent">{badge}</span>
          ))}
        </div>
        <div className="earn-row__head">
          <h3>{submission.productName}</h3>
          <p>{submission.description || "Open the app, move through the main experience, and share thoughtful usability feedback."}</p>
        </div>
      </div>
      <div className="earn-row__aside">
        <small className="earn-row__date">Submitted {formatDate(submission.createdAt)}</small>
        <Link to={`/test/${submission.id}`} className="button button--primary">
          Start test
          <ArrowRight size={16} />
        </Link>
      </div>
    </Surface>
  );
}
