import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDate, productTypeBadge } from "../lib/format";
import { getAvailableSubmissions } from "../lib/selectors";
import { Submission } from "../types";

export function EarnPage() {
  const [sortMode, setSortMode] = useState("recommended");
  const [typeFilter, setTypeFilter] = useState("all");
  const { state } = useAppState();
  const available = getAvailableSubmissions(state);

  const items = useMemo(() => {
    let next = [...available];

    if (typeFilter !== "all") {
      next = next.filter((item) => item.productType === typeFilter);
    }

    if (sortMode === "newest") {
      next.sort(
        (first, second) =>
          new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      );
    }

    if (sortMode === "shortest") {
      next.sort((first, second) => first.estimatedMinutes - second.estimatedMinutes);
    }

    return next;
  }, [available, sortMode, typeFilter]);

  return (
    <AppShell
      title="Earn credits"
      description="Pick the next best product to review, keep the questionnaire open, and turn thoughtful feedback into more testing credits."
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
                  <option value="website">Website / Web app</option>
                  <option value="ios">IOS app</option>
                  <option value="android">Android app</option>
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
          <span className="pill pill--accent">{productTypeBadge(submission.productType)}</span>
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