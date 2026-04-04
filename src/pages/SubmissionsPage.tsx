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
import { getPrimaryAccessLink } from "../lib/format";
import {
  loadReportedFeedbackResponseIds,
  reconcileReportedFeedbackResponseIds,
} from "../lib/reportedFeedback";
import {
  addSubmissionFavorite,
  loadSubmissionFavoriteResponseIds,
  removeSubmissionFavorite,
  syncSubmissionFavorites,
} from "../lib/submissionFavorites";
import { loadSubmittedFeedbackCards } from "../lib/submittedFeedback";
import { FeedbackRatingValue, SubmittedFeedbackCard } from "../types";

type CardTone = FeedbackRatingValue | "pending";
type SubmissionViewMode = "all" | "favorites";

const LEGACY_FAVORITES_STORAGE_PREFIX = "test4test:submission-favorites:";

function getCardTone(ratingValue: FeedbackRatingValue | null): CardTone {
  if (ratingValue === "smiley") {
    return "pending";
  }

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

function canFavoriteSubmissionCard(card: SubmittedFeedbackCard) {
  return card.ratingValue !== "frowny" && card.ratingValue !== "neutral";
}

function getLegacyFavoriteStorageKey(userId: string) {
  return `${LEGACY_FAVORITES_STORAGE_PREFIX}${userId}`;
}

function loadLegacyFavoriteResponseIds(userId: string) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const stored = window.localStorage.getItem(getLegacyFavoriteStorageKey(userId));

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function clearLegacyFavoriteResponseIds(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getLegacyFavoriteStorageKey(userId));
  } catch {
    return;
  }
}

export function SubmissionsPage() {
  const [viewMode, setViewMode] = useState<SubmissionViewMode>("all");
  const [cards, setCards] = useState<SubmittedFeedbackCard[]>([]);
  const [favoriteResponseIds, setFavoriteResponseIds] = useState<string[]>([]);
  const [favoritePendingIds, setFavoritePendingIds] = useState<string[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const { state, currentUser, isConfigured } = useAppState();

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured) {
      setFavoriteResponseIds([]);
      setFavoritePendingIds([]);
      setIsLoadingFavorites(false);
      setFavoriteError("");
      setViewMode("all");
      return undefined;
    }

    const loadFavorites = async () => {
      setIsLoadingFavorites(true);
      setFavoriteError("");

      try {
        const remoteFavorites = await loadSubmissionFavoriteResponseIds();
        const legacyFavorites = loadLegacyFavoriteResponseIds(currentUser.id);
        const missingLegacyFavorites = legacyFavorites.filter(
          (responseId) => !remoteFavorites.includes(responseId),
        );
        const nextFavorites =
          missingLegacyFavorites.length > 0
            ? [...remoteFavorites, ...missingLegacyFavorites]
            : remoteFavorites;

        if (missingLegacyFavorites.length > 0) {
          await syncSubmissionFavorites(currentUser.id, missingLegacyFavorites);
          clearLegacyFavoriteResponseIds(currentUser.id);
        }

        if (!isCancelled) {
          setFavoriteResponseIds(nextFavorites);
        }
      } catch (error) {
        if (!isCancelled) {
          setFavoriteResponseIds([]);
          setFavoriteError(
            error instanceof Error
              ? error.message
              : "We could not load favorites right now.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingFavorites(false);
        }
      }
    };

    void loadFavorites();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, isConfigured]);

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
        const localReportedIds = loadReportedFeedbackResponseIds(currentUser.id);
        const mergedCards = nextCards.map((card) => (
          card.reportStatus
            ? card
            : localReportedIds.includes(card.responseId)
              ? { ...card, reportStatus: "pending" as const }
              : card
        ));

        reconcileReportedFeedbackResponseIds(currentUser.id, mergedCards);

        if (!isCancelled) {
          setCards(mergedCards);
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
    if (!currentUser || cards.length === 0) {
      return;
    }

    const validIds = new Set(
      cards
        .filter((card) => canFavoriteSubmissionCard(card))
        .map((card) => card.responseId),
    );
    const staleIds = favoriteResponseIds.filter((responseId) => !validIds.has(responseId));

    if (staleIds.length === 0) {
      return;
    }

    setFavoriteResponseIds((current) => current.filter((responseId) => validIds.has(responseId)));
    void Promise.allSettled(
      staleIds.map((responseId) => removeSubmissionFavorite(currentUser.id, responseId)),
    );
  }, [cards, currentUser, favoriteResponseIds]);

  const favoriteResponseIdSet = useMemo(
    () => new Set(favoriteResponseIds),
    [favoriteResponseIds],
  );

  const favoritePendingIdSet = useMemo(
    () => new Set(favoritePendingIds),
    [favoritePendingIds],
  );

  const items = useMemo(() => {
    if (viewMode === "favorites") {
      return cards.filter(
        (card) => canFavoriteSubmissionCard(card) && favoriteResponseIdSet.has(card.responseId),
      );
    }

    return [...cards].sort(compareAllSubmissionCards);
  }, [cards, favoriteResponseIdSet, viewMode]);

  const toggleFavorite = async (responseId: string) => {
    if (!currentUser || favoritePendingIdSet.has(responseId)) {
      return;
    }

    const wasFavorite = favoriteResponseIdSet.has(responseId);
    setFavoriteError("");
    setFavoritePendingIds((current) => [...current, responseId]);
    setFavoriteResponseIds((current) =>
      wasFavorite
        ? current.filter((currentId) => currentId !== responseId)
        : [...current, responseId],
    );

    try {
      if (wasFavorite) {
        await removeSubmissionFavorite(currentUser.id, responseId);
      } else {
        await addSubmissionFavorite(currentUser.id, responseId);
      }
    } catch (error) {
      setFavoriteResponseIds((current) =>
        wasFavorite
          ? current.includes(responseId)
            ? current
            : [...current, responseId]
          : current.filter((currentId) => currentId !== responseId),
      );
      setFavoriteError(
        error instanceof Error
          ? error.message
          : "We could not update favorites right now.",
      );
    } finally {
      setFavoritePendingIds((current) => current.filter((currentId) => currentId !== responseId));
    }
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
        {favoriteError ? <Surface className="callout callout--warning">{favoriteError}</Surface> : null}

        {isLoadingCards || isLoadingFavorites ? (
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
                  isFavoritePending={favoritePendingIdSet.has(card.responseId)}
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
  isFavoritePending,
  primaryAccessUrl,
  onToggleFavorite,
}: {
  card: SubmittedFeedbackCard;
  isFavorite: boolean;
  isFavoritePending: boolean;
  primaryAccessUrl: string | null;
  onToggleFavorite: (responseId: string) => void;
}) {
  const tone = getCardTone(card.ratingValue);
  const isAttentionCard = card.ratingValue === "frowny" || card.ratingValue === "neutral";
  const hasPendingReport = card.reportStatus === "pending";
  const canRevise =
    card.submissionStatus === "live" &&
    isAttentionCard &&
    !hasPendingReport;
  const showBookmark = !isAttentionCard;

  return (
    <Surface className={`submission-feedback-card submission-feedback-card--${tone}`}>
      <div className="submission-feedback-card__top">
        <div className="submission-feedback-card__badges" aria-hidden="true" />
        {showBookmark ? (
          <button
            type="button"
            className={`submission-feedback-card__bookmark${isFavorite ? " submission-feedback-card__bookmark--active" : ""}`}
            aria-label={isFavorite ? `Remove ${card.productName} from favorites` : `Add ${card.productName} to favorites`}
            aria-pressed={isFavorite}
            disabled={isFavoritePending}
            onClick={() => void onToggleFavorite(card.responseId)}
          >
            <Bookmark size={18} fill={isFavorite ? "currentColor" : "none"} stroke={isFavorite ? "none" : "currentColor"} />
          </button>
        ) : null}
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
          {hasPendingReport ? (
            <span className="submission-feedback-card__status-pill submission-feedback-card__status-pill--report">Report in progress</span>
          ) : canRevise ? (
            <Link
              to={`/submissions/${card.responseId}/revise`}
              className={`submission-feedback-card__action-button submission-feedback-card__action-button--${tone}`}
            >
              Revise Feedback
              <ArrowRight size={16} />
            </Link>
          ) : card.ratingValue === "smiley" ? (
            <span className="submission-feedback-card__status-pill submission-feedback-card__status-pill--helpful" aria-label="Helpful feedback">
              <span>Helpful</span>
              <Smile size={20} strokeWidth={1.85} aria-hidden="true" />
            </span>
          ) : card.ratingValue === null ? null : (
            <span className="submission-feedback-card__status-pill">Test closed</span>
          )}
        </div>
      </div>
    </Surface>
  );
}





