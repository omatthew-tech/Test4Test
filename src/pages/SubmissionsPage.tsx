import { IconButton, Link as DesignSystemLink, StarRatingDisplay } from "@test4test/design-system";
import { createStarRatingCards } from "../testing/starRatingFixtures";
import { isRevisionRating, canReviseFeedback, compareSubmittedRatings } from "../lib/starRatings";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, ExternalLink, MessageCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
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
import { SubmittedFeedbackCard } from "../types";

type SubmissionViewMode = "all" | "favorites";

const LEGACY_FAVORITES_STORAGE_PREFIX = "test4test:submission-favorites:";

function canFavoriteSubmissionCard(card: SubmittedFeedbackCard) {
  return !isRevisionRating(card.starRating);
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
      ? parsed.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
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
  const starRatingFixture =
    import.meta.env.DEV &&
    import.meta.env.VITE_DS_FIXTURES === "1" &&
    new URLSearchParams(window.location.search).get("ds-star-ratings") === "1";

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
            error instanceof Error ? error.message : "We could not load favorites right now.",
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

    if (starRatingFixture) {
      setCards(createStarRatingCards());
      setIsLoadingCards(false);
      return;
    }

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
        const mergedCards = nextCards.map((card) =>
          card.reportStatus
            ? card
            : localReportedIds.includes(card.responseId)
              ? { ...card, reportStatus: "pending" as const }
              : card,
        );

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
  }, [currentUser, isConfigured, starRatingFixture]);

  useEffect(() => {
    if (!currentUser || cards.length === 0) {
      return;
    }

    const validIds = new Set(
      cards.filter((card) => canFavoriteSubmissionCard(card)).map((card) => card.responseId),
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

  const favoriteResponseIdSet = useMemo(() => new Set(favoriteResponseIds), [favoriteResponseIds]);

  const favoritePendingIdSet = useMemo(() => new Set(favoritePendingIds), [favoritePendingIds]);

  const items = useMemo(() => {
    if (viewMode === "favorites") {
      return cards.filter(
        (card) => canFavoriteSubmissionCard(card) && favoriteResponseIdSet.has(card.responseId),
      );
    }

    return [...cards].sort(compareSubmittedRatings);
  }, [cards, favoriteResponseIdSet, viewMode]);
  const closedTestItems = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return state.googlePlayClosedTestParticipations
      .filter((participation) => participation.testerUserId === currentUser.id)
      .map((participation) => {
        const submission = state.submissions.find((item) => item.id === participation.submissionId);
        const checkInCount = state.googlePlayClosedTestCheckIns.filter(
          (checkIn) => checkIn.participationId === participation.id,
        ).length;

        return {
          participation,
          submission,
          checkInCount,
        };
      })
      .sort(
        (first, second) =>
          new Date(second.participation.createdAt).getTime() -
          new Date(first.participation.createdAt).getTime(),
      );
  }, [
    currentUser,
    state.googlePlayClosedTestCheckIns,
    state.googlePlayClosedTestParticipations,
    state.submissions,
  ]);

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
        error instanceof Error ? error.message : "We could not update favorites right now.",
      );
    } finally {
      setFavoritePendingIds((current) => current.filter((currentId) => currentId !== responseId));
    }
  };

  if (!currentUser) {
    return (
      <AppShell eyebrowLabel={null}>
        <div className="page-stack submissions-page">
          <h1 className="ds-sr-only">Submitted reviews</h1>
          <Surface>
            <div className="empty-state">
              <h3>Sign in to view your submitted tests</h3>
              <p>
                Once you complete tests for other users, they&apos;ll appear here so you can save
                favorites and revise feedback when needed.
              </p>
              <Link to="/sign-in" className="button button--primary">
                Sign in
              </Link>
            </div>
          </Surface>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell eyebrowLabel={null}>
      <div className="page-stack submissions-page">
        <h1 className="ds-sr-only">Submitted reviews</h1>
        <Surface className="earn-controls submissions-switcher">
          <div className="results-toggle" role="group" aria-label="Feedback view">
            <button
              type="button"
              className={`results-toggle__button${viewMode === "all" ? " results-toggle__button--active" : ""}`}
              onClick={() => setViewMode("all")}
              aria-pressed={viewMode === "all"}
            >
              All Feedback
            </button>
            <button
              type="button"
              className={`results-toggle__button${viewMode === "favorites" ? " results-toggle__button--active" : ""}`}
              onClick={() => setViewMode("favorites")}
              aria-pressed={viewMode === "favorites"}
            >
              Favorites
            </button>
          </div>
        </Surface>

        {favoriteError ? (
          <Surface className="callout callout--warning">{favoriteError}</Surface>
        ) : null}

        {closedTestItems.length > 0 ? (
          <Surface className="google-play-feedback-panel">
            <div className="section-heading">
              <span className="eyebrow">Google Play closed tests</span>
              <h2>14-day commitments</h2>
            </div>
            <div className="google-play-feedback-list">
              {closedTestItems.map(({ participation, submission, checkInCount }) => (
                <div key={participation.id} className="google-play-feedback-row">
                  <div>
                    <strong>{submission?.productName ?? "Closed test"}</strong>
                    <p>
                      {participation.status === "completed"
                        ? "Completed"
                        : participation.status === "missed"
                          ? "Missed a day"
                          : participation.status === "cancelled"
                            ? "Cancelled"
                            : `${Math.min(checkInCount, participation.requiredDays)} / ${participation.requiredDays} days checked in`}
                    </p>
                  </div>
                  {submission ? (
                    <Link
                      to={`/test/${submission.id}`}
                      className="button button--secondary button--small"
                    >
                      Open test
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </Surface>
        ) : null}

        {isLoadingCards || isLoadingFavorites ? (
          <Surface>
            <div className="empty-state">
              <h3>Loading your submissions</h3>
              <p>Pulling together your submitted tests and their latest ratings.</p>
            </div>
          </Surface>
        ) : loadError ? (
          <Surface>
            <div className="empty-state" role="alert">
              <h3>Your submitted tests could not be loaded</h3>
              <p>Please refresh the page to try again.</p>
            </div>
          </Surface>
        ) : items.length > 0 ? (
          <div className="submission-feedback-list">
            {items.map((card) => {
              const submission = state.submissions.find((item) => item.id === card.submissionId);
              const primaryAccessUrl = submission
                ? (getPrimaryAccessLink(submission.accessLinks, submission.productTypes)
                    ?.normalizedUrl ?? null)
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
              <p>
                Click the bookmark on any submission card to save it here for quick access later.
              </p>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setViewMode("all")}
              >
                View all submissions
              </button>
            </div>
          </Surface>
        ) : (
          <Surface>
            <div className="empty-state">
              <h3>No submitted tests yet</h3>
              <p>
                Complete a test from the Earn page and it will show up here for follow-up and
                revisions.
              </p>
              <Link to="/earn" className="button button--primary">
                Browse tests
              </Link>
            </div>
          </Surface>
        )}
      </div>
    </AppShell>
  );
}

export function SubmissionFeedbackRow({
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
  const location = useLocation();
  const isAttentionCard = isRevisionRating(card.starRating);
  const hasPendingReport = card.reportStatus === "pending";
  const canRevise = canReviseFeedback(card);
  const showBookmark = !isAttentionCard;
  const showStatus =
    card.starRating !== null || hasPendingReport || card.submissionStatus !== "live";
  const messageQuery = new URLSearchParams({ response: card.responseId });
  if (import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1") {
    const current = new URLSearchParams(location.search);
    for (const key of ["ds-user", "ds-tester"]) {
      const value = current.get(key);
      if (value) messageQuery.set(key, value);
    }
  }

  return (
    <Surface className="submission-feedback-card">
      <div className="submission-feedback-card__header">
        <div className="submission-feedback-card__title-row">
          <h2>{card.productName}</h2>
          {primaryAccessUrl ? (
            <a
              href={primaryAccessUrl}
              target="_blank"
              rel="noreferrer"
              className="submission-feedback-card__title-link"
              aria-label={`Open ${card.productName}`}
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <div className="submission-feedback-card__quick-actions">
          <DesignSystemLink
            to={`/messages?${messageQuery}`}
            className="submission-feedback-card__icon-action"
            aria-label={`Message about ${card.productName}`}
            title={`Message about ${card.productName}`}
          >
            <MessageCircle aria-hidden="true" />
          </DesignSystemLink>
          {showBookmark ? (
            <IconButton
              type="button"
              variant="quiet"
              className="submission-feedback-card__icon-action"
              label={
                isFavorite
                  ? `Remove ${card.productName} from favorites`
                  : `Add ${card.productName} to favorites`
              }
              aria-pressed={isFavorite}
              disabled={isFavoritePending}
              onClick={() => void onToggleFavorite(card.responseId)}
            >
              <Bookmark aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
            </IconButton>
          ) : null}
        </div>
      </div>

      <div className="submission-feedback-card__body">
        <div className="submission-feedback-card__copy">
          <p>
            {card.description ||
              "Open the app, move through the main experience, and share thoughtful usability feedback."}
          </p>
          {card.needsGooglePlayClosedTesters ? (
            <span className="tag tag--warm">Google Play closed test</span>
          ) : null}
        </div>
        {showStatus ? (
          <div className="submission-feedback-card__actions">
            {card.starRating !== null ? <StarRatingDisplay value={card.starRating} /> : null}
            {hasPendingReport ? (
              <span className="submission-feedback-card__status-pill submission-feedback-card__status-pill--report">
                Report in progress
              </span>
            ) : canRevise ? (
              <Link
                to={`/submissions/${card.responseId}/revise`}
                className="submission-feedback-card__action-button"
              >
                Revise Feedback
                <ArrowRight size={16} />
              </Link>
            ) : card.submissionStatus !== "live" ? (
              <>
                <span className="submission-feedback-card__status-pill">Test closed</span>
                {isAttentionCard ? (
                  <DesignSystemLink
                    to={`/submissions/${card.responseId}/revise`}
                    className="submission-feedback-card__action-button"
                  >
                    Report Rating
                  </DesignSystemLink>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
