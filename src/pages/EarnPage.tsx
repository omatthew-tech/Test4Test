import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { loadEarnSubmissionReputations } from "../lib/earnReputation";
import {
  formatDate,
  normalizeProductTypes,
  PRODUCT_TYPE_ORDER,
  productTypesBadges,
} from "../lib/format";
import { getActiveQuestionSet, getAvailableSubmissions } from "../lib/selectors";
import { loadMySubmissionReportStatuses } from "../lib/testReports";
import { loadTestResponseDraft } from "../lib/testResponseDrafts";
import {
  EarnSubmissionCard,
  EarnSubmissionReputation,
  ProductType,
  Submission,
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

export function EarnPage() {
  const { state, currentUser, isConfigured } = useAppState();
  const [sortMode, setSortMode] = useState("recommended");
  const [selectedProductTypes, setSelectedProductTypes] = useState<ProductType[]>(() => {
    if (!currentUser) {
      return getDefaultSelectedProductTypes(state.submissions, null);
    }

    const storedProductTypes = readStoredProductTypes(currentUser.id);

    return storedProductTypes ?? getDefaultSelectedProductTypes(state.submissions, currentUser.id);
  });
  const [pendingProductTypes, setPendingProductTypes] = useState<ProductType[]>(selectedProductTypes);
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [reputationBySubmissionId, setReputationBySubmissionId] = useState<
    Record<string, EarnSubmissionReputation>
  >({});
  const [draftProgressBySubmissionId, setDraftProgressBySubmissionId] = useState<Record<string, boolean>>({});
  const [hiddenReportedSubmissionIds, setHiddenReportedSubmissionIds] = useState<string[]>([]);
  const available = getAvailableSubmissions(state);

  const defaultSelectedProductTypes = useMemo(
    () => getDefaultSelectedProductTypes(state.submissions, currentUser?.id ?? null),
    [currentUser?.id, state.submissions],
  );
  const defaultSelectedProductTypesKey = defaultSelectedProductTypes.join("|");

  useEffect(() => {
    if (!currentUser) {
      setSelectedProductTypes(defaultSelectedProductTypes);
      setPendingProductTypes(defaultSelectedProductTypes);
      setIsPlatformModalOpen(false);
      return;
    }

    const storedProductTypes = readStoredProductTypes(currentUser.id);
    const hasStoredConfirmation = readStoredPlatformConfirmation(currentUser.id);
    const isConfirmed = hasStoredConfirmation && storedProductTypes !== null;
    const nextSelectedProductTypes = storedProductTypes ?? defaultSelectedProductTypes;

    setSelectedProductTypes(nextSelectedProductTypes);
    setPendingProductTypes(nextSelectedProductTypes);
    setIsPlatformModalOpen(!isConfirmed);
  }, [currentUser?.id, defaultSelectedProductTypesKey]);

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
    setIsPlatformModalOpen(false);
  };

  const candidateSubmissions = useMemo(() => {
    if (selectedProductTypes.length === 0) {
      return [];
    }

    const hiddenReportedSubmissions = new Set(hiddenReportedSubmissionIds);

    return available.filter((item) =>
      !hiddenReportedSubmissions.has(item.id) &&
      item.productTypes.some((productType) => selectedProductTypes.includes(productType)),
    );
  }, [available, hiddenReportedSubmissionIds, selectedProductTypes]);

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
          onToggle={togglePendingProductType}
          onClose={closePlatformModal}
          onConfirm={confirmPlatformSelection}
        />
      ) : null}
    </AppShell>
  );
}

function EarnPlatformModal({
  selectedProductTypes,
  onToggle,
  onClose,
  onConfirm,
}: {
  selectedProductTypes: ProductType[];
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
          I Confirm
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

