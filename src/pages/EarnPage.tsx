import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  PencilLine,
  Share2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { loadEarnSubmissionReputations } from "../lib/earnReputation";
import { loadEarnVisibilitySummary } from "../lib/earnVisibility";
import {
  formatDate,
  normalizeProductTypes,
  PRODUCT_TYPE_ORDER,
  productTypesBadges,
} from "../lib/format";
import { getActiveQuestionSet, getAvailableSubmissions } from "../lib/selectors";
import { loadSubmittedFeedbackCards } from "../lib/submittedFeedback";
import { loadMySubmissionReportStatuses } from "../lib/testReports";
import { loadTestResponseDraft } from "../lib/testResponseDrafts";
import {
  EarnSubmissionCard,
  EarnSubmissionReputation,
  EarnVisibilitySummary,
  ProductType,
  Submission,
  SubmittedFeedbackCard,
} from "../types";

const EARN_PLATFORM_FILTER_STORAGE_PREFIX = "test4test:earn-platform-filter:";
const EARN_PLATFORM_CONFIRMATION_STORAGE_PREFIX = "test4test:earn-platform-filter-confirmed:";
const productTypeSet = new Set<ProductType>(PRODUCT_TYPE_ORDER);

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

function userIsInGooglePlayClosedTestPool(submissions: Submission[], userId: string | null) {
  if (!userId) {
    return false;
  }

  return submissions.some(
    (submission) =>
      submission.userId === userId &&
      submission.status === "live" &&
      submission.needsGooglePlayClosedTesters,
  );
}

function getGooglePlayClosedTestPoolUserIds(submissions: Submission[]) {
  return new Set(
    submissions
      .filter(
        (submission) =>
          submission.status === "live" && submission.needsGooglePlayClosedTesters,
      )
      .map((submission) => submission.userId)
      .filter((userId): userId is string => Boolean(userId)),
  );
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

function earnPlatformLabel(productType: ProductType) {
  switch (productType) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    default:
      return "Website / Web app";
  }
}

function getEarnPlatformFilterStorageKey(userId: string) {
  return `${EARN_PLATFORM_FILTER_STORAGE_PREFIX}${userId}`;
}

function getEarnPlatformConfirmationStorageKey(userId: string) {
  return `${EARN_PLATFORM_CONFIRMATION_STORAGE_PREFIX}${userId}`;
}

function parseStoredProductTypes(value: string | null) {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      !Array.isArray(parsed) ||
      parsed.some((item) => typeof item !== "string" || !productTypeSet.has(item as ProductType))
    ) {
      return null;
    }

    return normalizeProductTypes(parsed as ProductType[]);
  } catch {
    return null;
  }
}

function readStoredProductTypes(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseStoredProductTypes(
      window.localStorage.getItem(getEarnPlatformFilterStorageKey(userId)),
    );
  } catch {
    return null;
  }
}

function saveStoredProductTypes(userId: string, productTypes: ProductType[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      getEarnPlatformFilterStorageKey(userId),
      JSON.stringify(normalizeProductTypes(productTypes)),
    );
  } catch {
    // Ignore storage failures so filtering still works in-memory.
  }
}

function readStoredPlatformConfirmation(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(getEarnPlatformConfirmationStorageKey(userId)) === "true";
  } catch {
    return false;
  }
}

function saveStoredPlatformConfirmation(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getEarnPlatformConfirmationStorageKey(userId), "true");
  } catch {
    // Ignore storage failures so the modal can still close for this session.
  }
}

function getDefaultSelectedProductTypes(submissions: Submission[], userId: string | null) {
  if (!userId) {
    return [...PRODUCT_TYPE_ORDER];
  }

  const ownedSubmittedProductTypes = normalizeProductTypes(
    submissions.flatMap((submission) =>
      submission.userId === userId ? submission.productTypes : [],
    ),
  );

  return ownedSubmittedProductTypes.length > 0
    ? normalizeProductTypes(["website", ...ownedSubmittedProductTypes])
    : [...PRODUCT_TYPE_ORDER];
}

function formatSelectedPlatformSummary(productTypes: ProductType[]) {
  const normalized = normalizeProductTypes(productTypes);

  if (normalized.length === 0) {
    return "None selected";
  }

  if (normalized.length === PRODUCT_TYPE_ORDER.length) {
    return "All platforms";
  }

  return normalized.map(earnPlatformLabel).join(", ");
}

function buildShareUrl(submissionId: string) {
  if (typeof window === "undefined") {
    return `/test/${submissionId}?shared=1`;
  }

  return `${window.location.origin}/test/${submissionId}?shared=1`;
}

async function copyTextToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function canReviseSubmittedFeedback(card: SubmittedFeedbackCard) {
  return (
    card.submissionStatus === "live" &&
    (card.ratingValue === "frowny" || card.ratingValue === "neutral") &&
    card.reportStatus !== "pending"
  );
}

export function EarnPage() {
  const { state, currentUser, isConfigured, listEarnSubmissions } = useAppState();
  const reciprocalRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [sortMode, setSortMode] = useState("recommended");
  const [selectedProductTypes, setSelectedProductTypes] = useState<ProductType[]>(() => {
    if (!currentUser) {
      return getDefaultSelectedProductTypes(state.submissions, null);
    }

    const storedProductTypes = readStoredProductTypes(currentUser.id);

    return storedProductTypes ?? getDefaultSelectedProductTypes(state.submissions, currentUser.id);
  });
  const [pendingProductTypes, setPendingProductTypes] = useState<ProductType[]>(selectedProductTypes);
  const [hasConfirmedPlatformFilter, setHasConfirmedPlatformFilter] = useState(() =>
    currentUser
      ? readStoredPlatformConfirmation(currentUser.id) &&
        readStoredProductTypes(currentUser.id) !== null
      : false,
  );
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [reputationBySubmissionId, setReputationBySubmissionId] = useState<
    Record<string, EarnSubmissionReputation>
  >({});
  const [serverEarnSubmissions, setServerEarnSubmissions] = useState<Submission[] | null>(null);
  const [serverEarnError, setServerEarnError] = useState("");
  const [draftProgressBySubmissionId, setDraftProgressBySubmissionId] = useState<Record<string, boolean>>({});
  const [hiddenReportedSubmissionIds, setHiddenReportedSubmissionIds] = useState<string[]>([]);
  const [visibilitySummary, setVisibilitySummary] = useState<EarnVisibilitySummary | null>(null);
  const [visibilityError, setVisibilityError] = useState("");
  const [revisionTargetResponseId, setRevisionTargetResponseId] = useState<string | null>(null);
  const [revisionTargetError, setRevisionTargetError] = useState("");
  const [isLoadingRevisionTarget, setIsLoadingRevisionTarget] = useState(false);
  const available = getAvailableSubmissions(state);

  const defaultSelectedProductTypes = useMemo(
    () => getDefaultSelectedProductTypes(state.submissions, currentUser?.id ?? null),
    [currentUser?.id, state.submissions],
  );
  const defaultSelectedProductTypesKey = defaultSelectedProductTypes.join("|");
  const selectedProductTypesKey = selectedProductTypes.join("|");
  const isGooglePlayClosedTestPool = useMemo(
    () => userIsInGooglePlayClosedTestPool(state.submissions, currentUser?.id ?? null),
    [currentUser?.id, state.submissions],
  );
  const googlePlayClosedTestPoolUserIds = useMemo(
    () => getGooglePlayClosedTestPoolUserIds(state.submissions),
    [state.submissions],
  );

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured) {
      setVisibilitySummary(null);
      setVisibilityError("");
      return undefined;
    }

    const loadSummary = async () => {
      try {
        const summary = await loadEarnVisibilitySummary();

        if (isCancelled) {
          return;
        }

        setVisibilitySummary(summary);
        setVisibilityError("");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error(error);
        setVisibilitySummary(null);
        setVisibilityError(
          error instanceof Error
            ? error.message
            : "We could not load your Earn visibility summary right now.",
        );
      }
    };

    void loadSummary();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, isConfigured, state]);

  useEffect(() => {
    let isCancelled = false;

    if (
      !currentUser ||
      !isConfigured ||
      !visibilitySummary ||
      visibilitySummary.satisfactionRatePercent >= 100
    ) {
      setRevisionTargetResponseId(null);
      setRevisionTargetError("");
      setIsLoadingRevisionTarget(false);
      return undefined;
    }

    const loadRevisionTarget = async () => {
      setRevisionTargetResponseId(null);
      setRevisionTargetError("");
      setIsLoadingRevisionTarget(true);

      try {
        const submittedFeedbackCards = await loadSubmittedFeedbackCards();
        const revisionTarget = submittedFeedbackCards.find(canReviseSubmittedFeedback);

        if (isCancelled) {
          return;
        }

        setRevisionTargetResponseId(revisionTarget?.responseId ?? null);
        setRevisionTargetError("");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error(error);
        setRevisionTargetResponseId(null);
        setRevisionTargetError(
          error instanceof Error
            ? error.message
            : "We could not find a review to revise right now.",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingRevisionTarget(false);
        }
      }
    };

    void loadRevisionTarget();

    return () => {
      isCancelled = true;
    };
  }, [
    currentUser?.id,
    isConfigured,
    visibilitySummary?.satisfactionRatePercent,
  ]);

  useEffect(() => {
    if (!currentUser) {
      setSelectedProductTypes(defaultSelectedProductTypes);
      setPendingProductTypes(defaultSelectedProductTypes);
      setHasConfirmedPlatformFilter(false);
      setIsPlatformModalOpen(false);
      return;
    }

    const storedProductTypes = readStoredProductTypes(currentUser.id);
    const hasStoredConfirmation = readStoredPlatformConfirmation(currentUser.id);
    const isConfirmed = hasStoredConfirmation && storedProductTypes !== null;
    const nextSelectedProductTypes = storedProductTypes ?? defaultSelectedProductTypes;

    setSelectedProductTypes(nextSelectedProductTypes);
    setPendingProductTypes(nextSelectedProductTypes);
    setHasConfirmedPlatformFilter(isConfirmed);
    setIsPlatformModalOpen(!isConfirmed);
  }, [currentUser?.id, defaultSelectedProductTypesKey]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured) {
      setServerEarnSubmissions(null);
      setServerEarnError("");
      return undefined;
    }

    if (selectedProductTypes.length === 0) {
      setServerEarnSubmissions([]);
      setServerEarnError("");
      return undefined;
    }

    const loadServerEarnSubmissions = async () => {
      try {
        const submissions = await listEarnSubmissions(selectedProductTypes);

        if (isCancelled) {
          return;
        }

        setServerEarnSubmissions(submissions);
        setServerEarnError("");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error(error);
        setServerEarnSubmissions(null);
        setServerEarnError(
          error instanceof Error
            ? error.message
            : "We could not load pool-filtered tests right now.",
        );
      }
    };

    void loadServerEarnSubmissions();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, isConfigured, listEarnSubmissions, selectedProductTypesKey]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured) {
      setHiddenReportedSubmissionIds([]);
      return undefined;
    }

    const loadReportedSubmissions = async () => {
      try {
        const reports = await loadMySubmissionReportStatuses();

        if (isCancelled) {
          return;
        }

        setHiddenReportedSubmissionIds(
          reports
            .filter((report) => report.status === "pending" || report.status === "confirmed")
            .map((report) => report.submissionId),
        );
      } catch (error) {
        if (!isCancelled) {
          console.error(error);
          setHiddenReportedSubmissionIds([]);
        }
      }
    };

    void loadReportedSubmissions();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, isConfigured]);

  const applyPlatformSelection = (productTypes: ProductType[]) => {
    const next = normalizeProductTypes(productTypes);

    setSelectedProductTypes(next);
    setPendingProductTypes(next);

    if (currentUser) {
      saveStoredProductTypes(currentUser.id, next);
    }
  };

  const togglePendingProductType = (productType: ProductType) => {
    applyPlatformSelection(
      pendingProductTypes.includes(productType)
        ? pendingProductTypes.filter((item) => item !== productType)
        : [...pendingProductTypes, productType],
    );
  };

  const openPlatformModal = () => {
    setPendingProductTypes(selectedProductTypes);
    setIsPlatformModalOpen(true);
  };

  const closePlatformModal = () => {
    applyPlatformSelection(pendingProductTypes);
    setIsPlatformModalOpen(false);
  };

  const confirmPlatformSelection = () => {
    const next = normalizeProductTypes(pendingProductTypes);

    if (currentUser) {
      saveStoredProductTypes(currentUser.id, next);
      saveStoredPlatformConfirmation(currentUser.id);
    }

    setSelectedProductTypes(next);
    setPendingProductTypes(next);
    setHasConfirmedPlatformFilter(true);
    setIsPlatformModalOpen(false);
  };

  const candidateSubmissions = useMemo(() => {
    if (selectedProductTypes.length === 0) {
      return [];
    }

    const hiddenReportedSubmissions = new Set(hiddenReportedSubmissionIds);

    const baseSubmissions = serverEarnSubmissions ?? available;

    return baseSubmissions.filter((item) =>
      !hiddenReportedSubmissions.has(item.id) &&
      (serverEarnSubmissions !== null ||
        (
          item.needsGooglePlayClosedTesters === isGooglePlayClosedTestPool &&
          googlePlayClosedTestPoolUserIds.has(item.userId ?? "") === isGooglePlayClosedTestPool
        )) &&
      item.productTypes.some((productType) => selectedProductTypes.includes(productType)),
    );
  }, [
    available,
    googlePlayClosedTestPoolUserIds,
    hiddenReportedSubmissionIds,
    isGooglePlayClosedTestPool,
    selectedProductTypes,
    serverEarnSubmissions,
  ]);

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

  const firstTestBackCard = useMemo(
    () => cards.find((card) => card.reputation?.ownerHasTestedYou === true) ?? null,
    [cards],
  );

  const scrollToFirstTestBackTarget = () => {
    if (!firstTestBackCard) {
      return;
    }

    const target = reciprocalRowRefs.current[firstTestBackCard.submission.id];

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  return (
    <AppShell
      title="Earn credits"
      description={undefined}
      eyebrowLabel={null}
    >
      <div className="page-stack earn-page">
        <EarnVisibilityPanel
          summary={visibilitySummary}
          error={visibilityError}
          isSignedIn={Boolean(currentUser)}
          hasTestBackTarget={Boolean(firstTestBackCard)}
          revisionTargetResponseId={revisionTargetResponseId}
          revisionTargetError={revisionTargetError}
          isLoadingRevisionTarget={isLoadingRevisionTarget}
          onImproveRate={scrollToFirstTestBackTarget}
        />

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
            <div className="earn-platform-summary">
              <button
                type="button"
                className="button button--secondary button--small earn-platform-summary-button"
                onClick={openPlatformModal}
                aria-label={`Choose platforms you can test. Current selection: ${formatSelectedPlatformSummary(selectedProductTypes)}.`}
              >
                Edit Preferences
              </button>
            </div>
          </div>
        </Surface>

        {serverEarnError ? (
          <Surface className="callout callout--warning">{serverEarnError}</Surface>
        ) : null}

        {cards.length > 0 ? (
          <div className="earn-list">
            {cards.map((card) => (
              <div
                key={card.submission.id}
                ref={(element) => {
                  reciprocalRowRefs.current[card.submission.id] = element;
                }}
                className="earn-row-anchor"
                tabIndex={-1}
              >
                <EarnRow
                  card={card}
                  hasDraftProgress={draftProgressBySubmissionId[card.submission.id] === true}
                />
              </div>
            ))}
          </div>
        ) : (
          <Surface>
            <div className="empty-state">
              {selectedProductTypes.length === 0 ? (
                <>
                  <h3>No platforms selected</h3>
                  <p>Select at least one platform to see matching tests.</p>
                </>
              ) : (
                <>
                  <h3>No matching tests right now</h3>
                  <p>Try a different filter or publish your own product so the exchange loop keeps moving.</p>
                  <Link to="/submit" className="button button--primary">Submit your app</Link>
                </>
              )}
            </div>
          </Surface>
        )}
      </div>

      {isPlatformModalOpen ? (
        <EarnPlatformModal
          selectedProductTypes={pendingProductTypes}
          confirmLabel={hasConfirmedPlatformFilter ? "Save" : "I Confirm"}
          onToggle={togglePendingProductType}
          onClose={closePlatformModal}
          onConfirm={confirmPlatformSelection}
        />
      ) : null}
    </AppShell>
  );
}

function EarnVisibilityPanel({
  summary,
  error,
  isSignedIn,
  hasTestBackTarget,
  revisionTargetResponseId,
  revisionTargetError,
  isLoadingRevisionTarget,
  onImproveRate,
}: {
  summary: EarnVisibilitySummary | null;
  error: string;
  isSignedIn: boolean;
  hasTestBackTarget: boolean;
  revisionTargetResponseId: string | null;
  revisionTargetError: string;
  isLoadingRevisionTarget: boolean;
  onImproveRate: () => void;
}) {
  const [shareCopyStatus, setShareCopyStatus] = useState("");
  const hasLiveTest = Boolean(summary?.submissionId);
  const showImproveRate = Boolean(summary && summary.testBackRatePercent < 100);
  const showReviseReview = Boolean(summary && summary.satisfactionRatePercent < 100);
  const rankValue = !summary
    ? "..."
    : hasLiveTest && summary.rank
      ? `#${summary.rank}`
      : "--";
  const rankDetail = !summary
    ? "Loading Rank"
    : hasLiveTest && summary.rank
      ? null
      : hasLiveTest
        ? "Not visible on Earn right now"
        : "Submit an app to earn a Rank";
  const appName = summary?.productName ?? (summary ? "No live test" : "Loading your visibility");
  const shareUrl = summary?.submissionId ? buildShareUrl(summary.submissionId) : "";

  useEffect(() => {
    setShareCopyStatus("");
  }, [summary?.submissionId]);

  const copyShareLink = async () => {
    if (!shareUrl) {
      return;
    }

    const copied = await copyTextToClipboard(shareUrl);
    setShareCopyStatus(copied ? "Copied" : "Copy failed");
  };

  if (!isSignedIn) {
    return (
      <Surface className="earn-visibility">
        <div className="earn-visibility__app-bar">
          <div className="earn-visibility__app-name">
            <h2>Sign in to see your Rank</h2>
          </div>
          <Link to="/sign-in" className="button button--primary button--small">
            Log in
            <ArrowRight size={16} />
          </Link>
        </div>
      </Surface>
    );
  }

  return (
    <Surface className="earn-visibility">
      <div className="earn-visibility__app-bar">
        <div className="earn-visibility__app-name">
          <h2>{appName}</h2>
        </div>
        {hasLiveTest && summary?.submissionId ? (
          <div className="earn-visibility__app-actions">
            <Link
              to={`/my-tests?edit=${summary.submissionId}`}
              className="button button--secondary button--small"
            >
              <PencilLine size={16} />
              Edit
            </Link>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => void copyShareLink()}
            >
              {shareCopyStatus === "Copied" ? <Check size={16} /> : <Share2 size={16} />}
              {shareCopyStatus || "Share"}
            </button>
          </div>
        ) : !hasLiveTest && summary ? (
          <Link to="/submit" className="button button--primary button--small">
            Submit app
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </div>

      {error ? <div className="callout callout--warning">{error}</div> : null}

      <div className="earn-visibility__body" aria-label="Earn visibility metrics">
        <div className="earn-visibility__rank-panel">
          <span className="earn-visibility__rank-label">Rank</span>
          <div className="earn-visibility__rank-value">
            <strong>{rankValue}</strong>
          </div>
          {rankDetail ? <small>{rankDetail}</small> : null}
        </div>

        <div className="earn-visibility__details">
          <div className="earn-visibility__detail-row">
            <strong>{summary ? `${summary.testBackRatePercent}%` : "..."}</strong>
            <span>Test-back rate</span>
            {showImproveRate ? (
              <button
                type="button"
                className="button button--secondary button--small earn-visibility__inline-action"
                onClick={onImproveRate}
                disabled={!hasTestBackTarget}
              >
                Improve rate
              </button>
            ) : null}
          </div>
          {showImproveRate && !hasTestBackTarget ? (
            <small className="earn-visibility__detail-note">No available test-back target right now.</small>
          ) : null}

          <div className="earn-visibility__detail-row earn-visibility__detail-row--action">
            <strong>{summary ? `${summary.satisfactionRatePercent}%` : "..."}</strong>
            <span>Satisfaction rate</span>
            {showReviseReview ? (
              revisionTargetResponseId ? (
                <Link
                  to={`/submissions/${revisionTargetResponseId}/revise`}
                  className="button button--secondary button--small earn-visibility__inline-action"
                >
                  Revise
                </Link>
              ) : (
                <button
                  type="button"
                  className="button button--secondary button--small earn-visibility__inline-action"
                  disabled
                >
                  Revise
                </button>
              )
            ) : null}
          </div>
          {showReviseReview && isLoadingRevisionTarget ? (
            <small className="earn-visibility__detail-note">Finding review...</small>
          ) : null}
          {showReviseReview && !isLoadingRevisionTarget && revisionTargetError ? (
            <small className="earn-visibility__detail-note">{revisionTargetError}</small>
          ) : null}
          {showReviseReview && !isLoadingRevisionTarget && !revisionTargetResponseId && !revisionTargetError ? (
            <small className="earn-visibility__detail-note">No revisable low or okay reviews right now.</small>
          ) : null}

          <div className="earn-visibility__detail-row">
            <strong>{summary ? summary.tokenBalance : "..."}</strong>
            <span>Credits</span>
            <span className="earn-token-tooltip">
              <button
                type="button"
                className="earn-token-tooltip__trigger"
                aria-label="What credits do"
                aria-describedby="earn-token-tooltip"
              >
                <Info size={14} />
              </button>
              <span id="earn-token-tooltip" className="earn-token-tooltip__bubble" role="tooltip">
                The more credits you have, the more visibility your test gains
              </span>
            </span>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function EarnPlatformModal({
  selectedProductTypes,
  confirmLabel,
  onToggle,
  onClose,
  onConfirm,
}: {
  selectedProductTypes: ProductType[];
  confirmLabel: string;
  onToggle: (productType: ProductType) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="results-modal-backdrop earn-platform-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="results-modal earn-platform-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="earn-platform-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="results-modal__header earn-platform-modal__header">
          <div>
            <h2 id="earn-platform-modal-title">What platforms can you reliably access?</h2>
            <p>
              It&apos;s important to keep your preferences up to date so it&apos;s easy to test back
              other users. Your preferences can be changed at anytime.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close platform selection"
          >
            <X size={18} />
          </button>
        </div>

        <div className="earn-platform-toggle-list" aria-label="Platforms you can test">
          {PRODUCT_TYPE_ORDER.map((productType) => {
            const isSelected = selectedProductTypes.includes(productType);

            return (
              <button
                key={productType}
                type="button"
                className={`earn-platform-toggle${isSelected ? " earn-platform-toggle--selected" : ""}`}
                aria-pressed={isSelected}
                onClick={() => onToggle(productType)}
              >
                <span className="earn-platform-toggle__label">
                  {earnPlatformLabel(productType)}
                </span>
                <span className="earn-platform-toggle__switch" aria-hidden="true">
                  <span />
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className="button button--primary earn-platform-confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
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
            {submission.needsGooglePlayClosedTesters ? (
              <span className="tag tag--warm earn-row__closed-test-tag">Google Play closed test</span>
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
            {submission.needsGooglePlayClosedTesters ? (
              <p className="earn-row__closed-test-note">
                Google Play closed test: join the Android test and check in once a day for 14 consecutive days.
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

