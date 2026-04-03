import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  ExternalLink,
  Smile,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { getPrimaryAccessLink, productTypeLabel, productTypesBadges } from "../lib/format";
import { loadSubmittedFeedbackCards } from "../lib/submittedFeedback";
import { FeedbackRatingValue, ProductType, SubmittedFeedbackCard } from "../types";

type SortMode = "attention" | "newest" | "highest";
type CardTone = FeedbackRatingValue | "pending";

function getCardTone(ratingValue: FeedbackRatingValue | null): CardTone {
  return ratingValue ?? "pending";
}

function getAttentionRank(ratingValue: FeedbackRatingValue | null) {
  switch (ratingValue) {
    case "frowny":
      return 0;
    case "neutral":
      return 1;
    case "smiley":
      return 3;
    default:
      return 2;
  }
}

function getHighestRank(ratingValue: FeedbackRatingValue | null) {
  switch (ratingValue) {
    case "smiley":
      return 3;
    case "neutral":
      return 2;
    case "frowny":
      return 1;
    default:
      return 0;
  }
}

function compareSubmittedCards(
  first: SubmittedFeedbackCard,
  second: SubmittedFeedbackCard,
  sortMode: SortMode,
) {
  if (sortMode === "newest") {
    return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
  }

  if (sortMode === "highest") {
    const scoreDifference = getHighestRank(second.ratingValue) - getHighestRank(first.ratingValue);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
  }

  const attentionDifference = getAttentionRank(first.ratingValue) - getAttentionRank(second.ratingValue);

  if (attentionDifference !== 0) {
    return attentionDifference;
  }

  return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
}

export function SubmissionsPage() {
  const [sortMode, setSortMode] = useState<SortMode>("attention");
  const [typeFilter, setTypeFilter] = useState("all");
  const [cards, setCards] = useState<SubmittedFeedbackCard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { state, currentUser, isConfigured } = useAppState();

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured) {
      setCards([]);
      setIsLoadingCards(false);
      setLoadError("");
      return undefined;
    }

    const loadCards = async () => {
      setIsLoadingCards(true);
      setLoadError("");

      try {
        const nextCards = await loadSubmittedFeedbackCards();

        if (!isCancelled) {
          setCards(nextCards);
        }
      } catch (error) {
        if (!isCancelled) {
          setCards([]);
          setLoadError(
            error instanceof Error
              ? error.message
              : "We could not load your submitted tests right now.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCards(false);
        }
      }
    };

    void loadCards();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, isConfigured]);

  const items = useMemo(() => {
    let next = [...cards];

    if (typeFilter !== "all") {
      next = next.filter((item) => item.productTypes.includes(typeFilter as ProductType));
    }

    next.sort((first, second) => compareSubmittedCards(first, second, sortMode));

    return next;
  }, [cards, sortMode, typeFilter]);

  if (!currentUser) {
    return (
      <AppShell title="Submissions" eyebrowLabel={null}>
        <div className="page-stack submissions-page">
          <Surface>
            <div className="empty-state">
              <h3>Sign in to view your submitted tests</h3>
              <p>Once you complete tests for other users, they&apos;ll appear here so you can revise feedback when needed.</p>
              <Link to="/sign-in" className="button button--primary">Sign in</Link>
            </div>
          </Surface>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Submissions" eyebrowLabel={null}>
      <div className="page-stack submissions-page">
        <Surface className="earn-controls">
          <div className="earn-controls__toolbar">
            <label className="earn-filter">
              <span className="earn-filter__label">Sort by</span>
              <div className="earn-filter__control">
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="attention">Needs attention / best next step</option>
                  <option value="newest">Newest submitted</option>
                  <option value="highest">Highest rated</option>
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

        {loadError ? <Surface className="callout callout--warning">{loadError}</Surface> : null}

        {isLoadingCards ? (
          <Surface>
            <div className="empty-state">
              <h3>Loading your submissions</h3>
              <p>Pulling together your submitted tests and their latest ratings.</p>
            </div>
          </Surface>
        ) : items.length > 0 ? (
          <div className="submission-feedback-list">
            {items.map((card) => {
              const submission = state.submissions.find((item) => item.id === card.submissionId);
              const primaryAccessUrl = submission
                ? getPrimaryAccessLink(submission.accessLinks, submission.productTypes)?.normalizedUrl ?? null
                : null;

              return (
                <SubmissionFeedbackRow
                  key={card.responseId}
                  card={card}
                  primaryAccessUrl={primaryAccessUrl}
                />
              );
            })}
          </div>
        ) : (
          <Surface>
            <div className="empty-state">
              <h3>No submitted tests yet</h3>
              <p>Complete a test from the Earn page and it will show up here for follow-up and revisions.</p>
              <Link to="/earn" className="button button--primary">Browse tests</Link>
            </div>
          </Surface>
        )}
      </div>
    </AppShell>
  );
}

function SubmissionFeedbackRow({
  card,
  primaryAccessUrl,
}: {
  card: SubmittedFeedbackCard;
  primaryAccessUrl: string | null;
}) {
  const tone = getCardTone(card.ratingValue);
  const canRevise =
    card.submissionStatus === "live" &&
    (card.ratingValue === "frowny" || card.ratingValue === "neutral");

  return (
    <Surface className={`submission-feedback-card submission-feedback-card--${tone}`}>
      <div className="submission-feedback-card__top">
        <div className="submission-feedback-card__badges">
          {productTypesBadges(card.productTypes).map((badge) => (
            <span key={`${card.responseId}-${badge}`} className="pill submission-feedback-card__badge">
              {badge}
            </span>
          ))}
        </div>
        <span className="submission-feedback-card__bookmark" aria-hidden="true">
          <Bookmark size={20} />
        </span>
      </div>

      <div className="submission-feedback-card__body">
        <div className="submission-feedback-card__copy">
          <div className="submission-feedback-card__title-row">
            <h3>{card.productName}</h3>
            {primaryAccessUrl ? (
              <a
                href={primaryAccessUrl}
                target="_blank"
                rel="noreferrer"
                className="submission-feedback-card__title-link"
                aria-label={`Open ${card.productName}`}
              >
                <ExternalLink size={16} />
              </a>
            ) : null}
          </div>
          <p>{card.description || "Open the app, move through the main experience, and share thoughtful usability feedback."}</p>
        </div>
        <div className="submission-feedback-card__actions">
          {canRevise ? (
            <Link
              to={`/submissions/${card.responseId}/revise`}
              className={`submission-feedback-card__action-button submission-feedback-card__action-button--${tone}`}
            >
              Revise Feedback
              <ArrowRight size={16} />
            </Link>
          ) : card.ratingValue === "smiley" ? (
            <span className="submission-feedback-card__status-icon" aria-label="Helpful feedback">
              <Smile size={30} />
            </span>
          ) : card.ratingValue === null ? null : (
            <span className="submission-feedback-card__status-pill">Test closed</span>
          )}
        </div>
      </div>

      <div className="submission-feedback-card__footer">
        {card.ownerAvatarUrl ? (
          <img src={card.ownerAvatarUrl} alt="" className="submission-feedback-card__avatar" />
        ) : null}
        <div className="submission-feedback-card__footer-text">
          <span>{card.ownerTestBackRatePercent}% Test-back Rate</span>
          <span aria-hidden="true">&bull;</span>
          <span>{card.ownerSatisfactionRatePercent}% Satisfaction Rate</span>
        </div>
      </div>
    </Surface>
  );
}