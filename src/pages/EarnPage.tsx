import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { loadEarnSubmissionReputations } from "../lib/earnReputation";
import { formatDate, productTypeLabel, productTypesBadges } from "../lib/format";
import { getActiveQuestionSet, getAvailableSubmissions } from "../lib/selectors";
import { loadTestResponseDraft } from "../lib/testResponseDrafts";
import {
  EarnSubmissionCard,
  EarnSubmissionReputation,
  ProductType,
  Submission,
} from "../types";

function compareEarnSubmissionsByMode(first: Submission, second: Submission, sortMode: string) {
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

function compareTestBackTargetSubmissions(first: Submission, second: Submission) {
  if (first.promoted !== second.promoted) {
    return first.promoted ? -1 : 1;
  }

  if (first.responseCount !== second.responseCount) {
    return first.responseCount - second.responseCount;
  }

  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}

function selectOneSubmissionPerOwner(submissions: Submission[]) {
  const selectedByOwner = new Map<string, Submission>();

  submissions.forEach((submission) => {
    if (!submission.userId) {
      return;
    }

    const current = selectedByOwner.get(submission.userId);

    if (!current || compareTestBackTargetSubmissions(submission, current) < 0) {
      selectedByOwner.set(submission.userId, submission);
    }
  });

  return [...selectedByOwner.values()];
}

function getReputationScore(reputation: EarnSubmissionReputation | null | undefined) {
  if (!reputation) {
    return null;
  }

  return reputation.ownerTestBackRatePercent + reputation.ownerSatisfactionRatePercent;
}

function compareEarnSubmissions(
  first: Submission,
  second: Submission,
  sortMode: string,
  firstReputation: EarnSubmissionReputation | null | undefined,
  secondReputation: EarnSubmissionReputation | null | undefined,
) {
  if (sortMode !== "recommended") {
    return compareEarnSubmissionsByMode(first, second, sortMode);
  }

  const firstCreditBalance = firstReputation?.ownerCreditBalance ?? 0;
  const secondCreditBalance = secondReputation?.ownerCreditBalance ?? 0;

  if (firstCreditBalance !== secondCreditBalance) {
    return secondCreditBalance - firstCreditBalance;
  }

  if (first.promoted !== second.promoted) {
    return first.promoted ? -1 : 1;
  }

  const firstOwnerTestedYou = firstReputation?.ownerHasTestedYou === true;
  const secondOwnerTestedYou = secondReputation?.ownerHasTestedYou === true;

  if (firstOwnerTestedYou !== secondOwnerTestedYou) {
    return firstOwnerTestedYou ? -1 : 1;
  }

  const firstScore = getReputationScore(firstReputation);
  const secondScore = getReputationScore(secondReputation);

  if (firstScore !== null && secondScore !== null && firstScore !== secondScore) {
    return secondScore - firstScore;
  }

  if (firstScore !== secondScore) {
    return secondScore === null ? -1 : 1;
  }

  return compareEarnSubmissionsByMode(first, second, sortMode);
}

function hasSavedDraftAnswers(answerValues: Record<string, string>) {
  return Object.values(answerValues).some((value) => value.trim().length > 0);
}

export function EarnPage() {
  const [sortMode, setSortMode] = useState("recommended");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reputationBySubmissionId, setReputationBySubmissionId] = useState<
    Record<string, EarnSubmissionReputation>
  >({});
  const [draftProgressBySubmissionId, setDraftProgressBySubmissionId] = useState<Record<string, boolean>>({});
  const { state, currentUser, isConfigured } = useAppState();
  const available = getAvailableSubmissions(state);

  const candidateSubmissions = useMemo(() => {
    let next = [...available];

    if (typeFilter !== "all") {
      next = next.filter((item) => item.productTypes.includes(typeFilter as ProductType));
    }

    return next;
  }, [available, typeFilter]);

  const candidateSubmissionIdsKey = useMemo(
    () => [...new Set(candidateSubmissions.map((item) => item.id))].sort().join("|"),
    [candidateSubmissions],
  );

  const displayedSubmissions = useMemo(() => {
    const reciprocalCandidates = selectOneSubmissionPerOwner(
      candidateSubmissions.filter(
        (submission) => reputationBySubmissionId[submission.id]?.ownerHasTestedYou === true,
      ),
    );
    const next = reciprocalCandidates.length > 0 ? reciprocalCandidates : [...candidateSubmissions];

    next.sort((first, second) =>
      compareEarnSubmissions(
        first,
        second,
        sortMode,
        reputationBySubmissionId[first.id],
        reputationBySubmissionId[second.id],
      ),
    );

    return next;
  }, [candidateSubmissions, reputationBySubmissionId, sortMode]);

  const displayedSubmissionIdsKey = useMemo(
    () => [...new Set(displayedSubmissions.map((item) => item.id))].sort().join("|"),
    [displayedSubmissions],
  );

  useEffect(() => {
    let isCancelled = false;
    const submissionIds = candidateSubmissionIdsKey ? candidateSubmissionIdsKey.split("|") : [];

    if (!isConfigured || !currentUser || submissionIds.length === 0) {
      setReputationBySubmissionId({});
      return undefined;
    }

    const loadReputations = async () => {
      try {
        const reputations = await loadEarnSubmissionReputations(submissionIds);

        if (isCancelled) {
          return;
        }

        setReputationBySubmissionId(
          Object.fromEntries(
            reputations.map((reputation) => [reputation.submissionId, reputation]),
          ),
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error(error);
        setReputationBySubmissionId({});
      }
    };

    void loadReputations();

    return () => {
      isCancelled = true;
    };
  }, [candidateSubmissionIdsKey, currentUser?.id, isConfigured]);

  useEffect(() => {
    let isCancelled = false;
    const submissionIds = displayedSubmissionIdsKey ? displayedSubmissionIdsKey.split("|") : [];

    if (!currentUser || submissionIds.length === 0) {
      setDraftProgressBySubmissionId({});
      return undefined;
    }

    const loadDraftProgress = async () => {
      const entries = await Promise.all(
        submissionIds.map(async (submissionId) => {
          const questionSet = getActiveQuestionSet(state, submissionId);

          if (!questionSet) {
            return [submissionId, false] as const;
          }

          const draft = await loadTestResponseDraft(currentUser.id, submissionId, questionSet.id);

          return [submissionId, Boolean(draft && hasSavedDraftAnswers(draft.answerValues))] as const;
        }),
      );

      if (isCancelled) {
        return;
      }

      setDraftProgressBySubmissionId(Object.fromEntries(entries));
    };

    void loadDraftProgress();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, displayedSubmissionIdsKey, state]);

  const cards = useMemo<EarnSubmissionCard[]>(
    () =>
      displayedSubmissions.map((submission) => ({
        submission,
        reputation: reputationBySubmissionId[submission.id] ?? null,
      })),
    [displayedSubmissions, reputationBySubmissionId],
  );

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

        {cards.length > 0 ? (
          <div className="earn-list">
            {cards.map((card) => (
              <EarnRow
                key={card.submission.id}
                card={card}
                hasDraftProgress={draftProgressBySubmissionId[card.submission.id] === true}
              />
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
  card,
  hasDraftProgress,
}: {
  card: EarnSubmissionCard;
  hasDraftProgress: boolean;
}) {
  const { submission, reputation } = card;
  const showReputation = reputation?.ownerHasTestedYou === true;

  return (
    <Surface className="earn-row">
      <div className="earn-row__content">
        <div className="earn-row__main">
          <div className="earn-row__pills">
            {showReputation ? (
              <span className="tag tag--warm earn-row__reciprocal-tag">
                <span className="earn-row__reciprocal-tag-label">This user tested your app</span>
              </span>
            ) : null}
            {productTypesBadges(submission.productTypes).map((badge) => (
              <span key={`${submission.id}-${badge}`} className="pill pill--accent">{badge}</span>
            ))}
            {submission.requiresRecording ? (
              <span className="tag tag--warm earn-row__recording-tag">Recording required</span>
            ) : null}
          </div>
          <div className="earn-row__head">
            <h3>{submission.productName}</h3>
            <p>{submission.description || "Open the app, move through the main experience, and share thoughtful usability feedback."}</p>
            {submission.requiresRecording ? (
              <p className="earn-row__recording-note">
                Screen + voice recording required. Record locally during the session, then upload the video after testing.
              </p>
            ) : null}
          </div>
        </div>
        <div className="earn-row__aside">
          <small className="earn-row__date">Submitted {formatDate(submission.createdAt)}</small>
          <Link to={`/test/${submission.id}`} className="button button--primary">
            {hasDraftProgress ? "Resume test" : "Start test"}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {showReputation && reputation ? (
        <div className="earn-row__footer">
          {reputation.ownerAvatarUrl ? (
            <img
              src={reputation.ownerAvatarUrl}
              alt=""
              className="earn-row__avatar"
              loading="lazy"
            />
          ) : null}
          <div className="earn-row__footer-text">
            <span>This user has a {reputation.ownerTestBackRatePercent}% Test-back Rate</span>
            <span aria-hidden="true">&bull;</span>
            <span>{reputation.ownerSatisfactionRatePercent}% Satisfaction Rate</span>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}

