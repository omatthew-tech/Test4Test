import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  ExternalLink,
  Smile,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { getPrimaryAccessLink, productTypesBadges } from "../lib/format";
import { loadSubmittedFeedbackCards } from "../lib/submittedFeedback";
import { FeedbackRatingValue, SubmittedFeedbackCard } from "../types";

type CardTone = FeedbackRatingValue | "pending";
type SubmissionViewMode = "all" | "favorites";

const FAVORITES_STORAGE_PREFIX = "test4test:submission-favorites:";

function getCardTone(ratingValue: FeedbackRatingValue | null): CardTone {
  return ratingValue ?? "pending";
}
function getAllSubmissionPriority(card: SubmittedFeedbackCard) {
  switch (card.ratingValue) {
    case "frowny":
      return 0;
    case "neutral":
      return 1;
    default:
      return 2;
  }
}

function compareAllSubmissionCards(first: SubmittedFeedbackCard, second: SubmittedFeedbackCard) {
  const priorityDifference = getAllSubmissionPriority(first) - getAllSubmissionPriority(second);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
}

function getFavoriteStorageKey(userId: string) {
  return `${FAVORITES_STORAGE_PREFIX}${userId}`;
}

function loadFavoriteResponseIds(userId: string) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const stored = window.localStorage.getItem(getFavoriteStorageKey(userId));

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function storeFavoriteResponseIds(userId: string, responseIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getFavoriteStorageKey(userId), JSON.stringify(responseIds));
  } catch {
    return;
  }
}

export function SubmissionsPage() {
  const [viewMode, setViewMode] = useState<SubmissionViewMode>("all");
  const [cards, setCards] = useState<SubmittedFeedbackCard[]>([]);
  const [favoriteResponseIds, setFavoriteResponseIds] = useState<string[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { state, currentUser, isConfigured } = useAppState();

  useEffect(() => {
    if (!currentUser) {
      setFavoriteResponseIds([]);
      setViewMode("all");
      return;
    }

    setFavoriteResponseIds(loadFavoriteResponseIds(currentUser.id));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    storeFavoriteResponseIds(currentUser.id, favoriteResponseIds);
  }, [currentUser?.id, favoriteResponseIds]);

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

  useEffect(() => {
    if (cards.length === 0) {
      return;
    }

    const validIds = new Set(cards.map((card) => card.responseId));
    setFavoriteResponseIds((current) => current.filter((responseId) => validIds.has(responseId)));
  }, [cards]);

  const favoriteResponseIdSet = useMemo(
    () => new Set(favoriteResponseIds),
    [favoriteResponseIds],
  );

  const items = useMemo(() => {
    if (viewMode === "favorites") {
      return cards.filter((card) => favoriteResponseIdSet.has(card.responseId));
    }

    return [...cards].sort(compareAllSubmissionCards);
  }, [cards, favoriteResponseIdSet, viewMode]);

  const toggleFavorite = (responseId: string) => {
    setFavoriteResponseIds((current) =>
      current.includes(responseId)
        ? current.filter((currentId) => currentId !== responseId)
        : [...current, responseId],
    );
  };

  if (!currentUser) {
    return (
      <AppShell title="Submissions" eyebrowLabel={null}>
        <div className="page-stack submissions-page">
          <Surface>
            <div className="empty-state">
              <h3>Sign in to view your submitted tests</h3>
              <p>Once you complete tests for other users, they&apos;ll appear here so you can save favorites and revise feedback when needed.</p>
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
        <Surface className="earn-controls submissions-switcher">
          <div className="results-toggle" role="tablist" aria-label="Submission view">
            <button
              type="button"
              className={`results-toggle__button${viewMode === "all" ? " results-toggle__button--active" : ""}`}
              onClick={() => setViewMode("all")}
            >
              All Submissions
            </button>
            <button
              type="button"
              className={`results-toggle__button${viewMode === "favorites" ? " results-toggle__button--active" : ""}`}
              onClick={() => setViewMode("favorites")}
            >
              Favorites
            </button>
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
                  isFavorite={favoriteResponseIdSet.has(card.responseId)}
                  primaryAccessUrl={primaryAccessUrl}
                  onToggleFavorite={toggleFavorite}
                />
              );
            })}
          </div>
        ) : viewMode === "favorites" ? (
          <Surface>
            <div className="empty-state">
              <h3>No favorite submissions yet</h3>
              <p>Click the bookmark on any submission card to save it here for quick access later.</p>
              <button type="button" className="button button--secondary" onClick={() => setViewMode("all")}>View all submissions</button>
            </div>
          </Surface>
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
  isFavorite,
  primaryAccessUrl,
  onToggleFavorite,
}: {
  card: SubmittedFeedbackCard;
  isFavorite: boolean;
  primaryAccessUrl: string | null;
  onToggleFavorite: (responseId: string) => void;
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
        <button
          type="button"
          className={`pill submission-feedback-card__bookmark${isFavorite ? " submission-feedback-card__bookmark--active" : ""}`}
          aria-label={isFavorite ? `Remove ${card.productName} from favorites` : `Add ${card.productName} to favorites`}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(card.responseId)}
        >
          <Bookmark size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
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