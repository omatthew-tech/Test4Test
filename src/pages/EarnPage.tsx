import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Globe2,
  Info,
  PencilLine,
  Share2,
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Progress,
  Surface,
  Toast,
  Tooltip,
} from "@test4test/design-system";
import { EditSubmissionModal } from "../components/EditSubmissionModal";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import {
  EARN_CREDIT_CELEBRATION_COPY,
  EarnPlacementSnapshot,
  parseEarnCreditCelebrationState,
  saveEarnPlacementSnapshot,
} from "../lib/earnPlacementCelebration";
import { loadEarnSubmissionReputations } from "../lib/earnReputation";
import { loadEarnVisibilitySubmission, loadEarnVisibilitySummary } from "../lib/earnVisibility";
import { normalizeProductTypes, PRODUCT_TYPE_ORDER, productTypesBadges } from "../lib/format";
import { getAvailableSubmissions } from "../lib/selectors";
import { loadSubmittedFeedbackCards } from "../lib/submittedFeedback";
import { loadMySubmissionReportStatuses } from "../lib/testReports";
import { loadTestResponseDraftProgress } from "../lib/testResponseDrafts";
import { devicesToProductTypes, productTypesToDevices } from "../lib/testerSignup";
import {
  EarnSubmissionCard,
  EarnSubmissionReputation,
  EarnVisibilitySummary,
  ProductType,
  Submission,
  SubmissionDraft,
  SubmittedFeedbackCard,
  TesterEarnAccessSummary,
} from "../types";
import styles from "./EarnPage.module.css";

const EARN_PLATFORM_FILTER_STORAGE_PREFIX = "test4test:earn-platform-filter:";
const EARN_PLATFORM_CONFIRMATION_STORAGE_PREFIX = "test4test:earn-platform-filter-confirmed:";
const EARN_PRIVATE_PLACEMENT_ROW_OFFSET_PX = 112;
const EARN_PRIVATE_PLACEMENT_MAX_OFFSET_PX = 448;
const productTypeSet = new Set<ProductType>(PRODUCT_TYPE_ORDER);

type EarnBadgeTone = "info" | "success" | "warning";

function EarnBadge({ children, tone }: { children: ReactNode; tone: EarnBadgeTone }) {
  return (
    <span className={`earn-row__badge-surface earn-row__badge-surface--${tone}`}>
      <Badge tone={tone}>{children}</Badge>
    </span>
  );
}

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
        (submission) => submission.status === "live" && submission.needsGooglePlayClosedTesters,
      )
      .map((submission) => submission.userId)
      .filter((userId): userId is string => Boolean(userId)),
  );
}

function compareEarnSubmissions(
  first: Submission,
  second: Submission,
  sortMode: string,
  firstReputation: EarnSubmissionReputation | null | undefined,
  secondReputation: EarnSubmissionReputation | null | undefined,
) {
  if (first.promoted !== second.promoted) {
    return first.promoted ? -1 : 1;
  }

  if (sortMode !== "recommended") {
    return compareEarnSubmissionsByMode(first, second, sortMode);
  }

  const firstCreditBalance = firstReputation?.ownerCreditBalance ?? 0;
  const secondCreditBalance = secondReputation?.ownerCreditBalance ?? 0;

  if (firstCreditBalance !== secondCreditBalance) {
    return secondCreditBalance - firstCreditBalance;
  }

  const firstTestBackRate =
    firstReputation?.ownerHasCompletedTest === false
      ? 0
      : (firstReputation?.ownerTestBackRatePercent ?? 0);
  const secondTestBackRate =
    secondReputation?.ownerHasCompletedTest === false
      ? 0
      : (secondReputation?.ownerTestBackRatePercent ?? 0);

  if (firstTestBackRate !== secondTestBackRate) {
    return secondTestBackRate - firstTestBackRate;
  }

  const firstSatisfactionRate =
    firstReputation?.ownerHasCompletedTest === false
      ? 0
      : (firstReputation?.ownerSatisfactionRatePercent ?? 0);
  const secondSatisfactionRate =
    secondReputation?.ownerHasCompletedTest === false
      ? 0
      : (secondReputation?.ownerSatisfactionRatePercent ?? 0);

  if (firstSatisfactionRate !== secondSatisfactionRate) {
    return secondSatisfactionRate - firstSatisfactionRate;
  }

  return compareEarnSubmissionsByMode(first, second, sortMode);
}

function earnPlatformLabel(productType: ProductType) {
  switch (productType) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    default:
      return "Websites";
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

function userPrefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canReviseSubmittedFeedback(card: SubmittedFeedbackCard) {
  return (
    card.submissionStatus === "live" &&
    (card.ratingValue === "frowny" || card.ratingValue === "neutral") &&
    card.reportStatus !== "pending"
  );
}

export function EarnPage() {
  const {
    state,
    currentUser,
    isConfigured,
    listEarnSubmissions,
    updateSubmissionDetails,
    updateTesterProfile,
    getTesterEarnAccessSummary,
  } = useAppState();
  const isTester = currentUser?.accountType === "tester";
  const designSystemFixturesEnabled =
    import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const editSubmissionId = searchParams.get("edit")?.trim() ?? "";
  const reciprocalRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const privatePlacementRowRef = useRef<HTMLDivElement | null>(null);
  const [selectedProductTypes, setSelectedProductTypes] = useState<ProductType[]>(() => {
    if (!currentUser) {
      return getDefaultSelectedProductTypes(state.submissions, null);
    }
    if (currentUser.accountType === "tester" && currentUser.testerProfile) {
      return devicesToProductTypes(currentUser.testerProfile.devices);
    }

    const storedProductTypes = readStoredProductTypes(currentUser.id);

    return storedProductTypes ?? getDefaultSelectedProductTypes(state.submissions, currentUser.id);
  });
  const [pendingProductTypes, setPendingProductTypes] =
    useState<ProductType[]>(selectedProductTypes);
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const [suppressedPlatformHoverType, setSuppressedPlatformHoverType] =
    useState<ProductType | null>(null);
  const [reputationBySubmissionId, setReputationBySubmissionId] = useState<
    Record<string, EarnSubmissionReputation>
  >({});
  const [serverEarnSubmissions, setServerEarnSubmissions] = useState<Submission[] | null>(null);
  const [isLoadingServerEarnSubmissions, setIsLoadingServerEarnSubmissions] = useState(false);
  const [serverEarnError, setServerEarnError] = useState("");
  const [testerAccessSummary, setTesterAccessSummary] = useState<TesterEarnAccessSummary | null>(
    null,
  );
  const [isLoadingTesterAccess, setIsLoadingTesterAccess] = useState(false);
  const [testerAccessError, setTesterAccessError] = useState("");
  const [draftProgressBySubmissionId, setDraftProgressBySubmissionId] = useState<
    Record<string, boolean>
  >({});
  const [hiddenReportedSubmissionIds, setHiddenReportedSubmissionIds] = useState<string[]>([]);
  const [visibilitySummary, setVisibilitySummary] = useState<EarnVisibilitySummary | null>(null);
  const [visibilitySubmission, setVisibilitySubmission] = useState<Submission | null>(null);
  const [visibilityError, setVisibilityError] = useState("");
  const [revisionTargetResponseId, setRevisionTargetResponseId] = useState<string | null>(null);
  const [revisionTargetError, setRevisionTargetError] = useState("");
  const [isLoadingRevisionTarget, setIsLoadingRevisionTarget] = useState(false);
  const [editingVisibilitySubmissionId, setEditingVisibilitySubmissionId] = useState<string | null>(
    null,
  );
  const [deepLinkSubmission, setDeepLinkSubmission] = useState<Submission | null>(null);
  const [editLinkError, setEditLinkError] = useState("");
  const [creditCelebration, setCreditCelebration] = useState(() =>
    parseEarnCreditCelebrationState(location.state),
  );
  const [showCreditToast, setShowCreditToast] = useState(Boolean(creditCelebration));
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
  const editingVisibilitySubmission = useMemo(
    () =>
      editingVisibilitySubmissionId
        ? (state.submissions.find(
            (submission) => submission.id === editingVisibilitySubmissionId,
          ) ??
          (visibilitySubmission?.id === editingVisibilitySubmissionId
            ? visibilitySubmission
            : deepLinkSubmission?.id === editingVisibilitySubmissionId
              ? deepLinkSubmission
              : null))
        : null,
    [deepLinkSubmission, editingVisibilitySubmissionId, state.submissions, visibilitySubmission],
  );
  const stateVisibilitySubmission = useMemo(
    () =>
      visibilitySummary?.submissionId
        ? (state.submissions.find(
            (submission) => submission.id === visibilitySummary.submissionId,
          ) ?? null)
        : null,
    [state.submissions, visibilitySummary?.submissionId],
  );
  useEffect(() => {
    let cancelled = false;

    if (!isTester) {
      setTesterAccessSummary(null);
      setTesterAccessError("");
      setIsLoadingTesterAccess(false);
      return undefined;
    }

    setIsLoadingTesterAccess(true);
    void getTesterEarnAccessSummary()
      .then((summary) => {
        if (cancelled) return;
        setTesterAccessSummary(summary);
        setTesterAccessError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setTesterAccessError(
          error instanceof Error
            ? error.message
            : "We could not load your paid-test progress right now.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTesterAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getTesterEarnAccessSummary, isTester]);

  useEffect(() => {
    if (!editSubmissionId) {
      return undefined;
    }

    if (!currentUser) {
      const returnTo = `/earn${searchParamsKey ? `?${searchParamsKey}` : ""}`;
      navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      return undefined;
    }

    let cancelled = false;
    const clearInvalidEditLink = () => {
      if (cancelled) return;

      setEditLinkError("That app could not be found or you no longer have access to edit it.");
      setEditingVisibilitySubmissionId(null);
      setDeepLinkSubmission(null);
      const nextSearchParams = new URLSearchParams(searchParamsKey);
      nextSearchParams.delete("edit");
      setSearchParams(nextSearchParams, { replace: true });
    };
    const openOwnedSubmission = (submission: Submission | null) => {
      if (!submission || submission.userId !== currentUser.id) {
        clearInvalidEditLink();
        return;
      }

      if (cancelled) return;
      setEditLinkError("");
      setDeepLinkSubmission(submission);
      setEditingVisibilitySubmissionId(submission.id);
    };
    const loadedSubmission = state.submissions.find(
      (submission) => submission.id === editSubmissionId,
    );

    if (loadedSubmission) {
      openOwnedSubmission(loadedSubmission);
      return () => {
        cancelled = true;
      };
    }

    if (!isConfigured) {
      clearInvalidEditLink();
      return () => {
        cancelled = true;
      };
    }

    void loadEarnVisibilitySubmission(editSubmissionId)
      .then(openOwnedSubmission)
      .catch(clearInvalidEditLink);

    return () => {
      cancelled = true;
    };
  }, [
    currentUser,
    editSubmissionId,
    isConfigured,
    navigate,
    searchParamsKey,
    setSearchParams,
    state.submissions,
  ]);
  useEffect(() => {
    const nextCelebration = parseEarnCreditCelebrationState(location.state);

    if (nextCelebration) {
      setCreditCelebration(nextCelebration);
    }
  }, [location.key, location.state]);

  useEffect(() => {
    if (!creditCelebration) {
      return undefined;
    }

    setShowCreditToast(true);

    const toastTimer = window.setTimeout(() => {
      setShowCreditToast(false);
      setCreditCelebration(null);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, 5200);

    return () => {
      window.clearTimeout(toastTimer);
    };
  }, [creditCelebration, location.pathname, location.search, navigate]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured || isTester) {
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
  }, [currentUser?.id, isConfigured, isTester]);

  useEffect(() => {
    let isCancelled = false;
    const submissionId = visibilitySummary?.submissionId;

    if (!currentUser || !isConfigured || !submissionId || isTester) {
      setVisibilitySubmission(null);
      return undefined;
    }

    if (stateVisibilitySubmission) {
      setVisibilitySubmission(stateVisibilitySubmission);
      return undefined;
    }

    const loadVisibilitySubmissionDetails = async () => {
      try {
        const submission = await loadEarnVisibilitySubmission(submissionId);

        if (isCancelled) {
          return;
        }

        setVisibilitySubmission(submission);
      } catch (error) {
        if (!isCancelled) {
          console.error(error);
          setVisibilitySubmission(stateVisibilitySubmission);
        }
      }
    };

    void loadVisibilitySubmissionDetails();

    return () => {
      isCancelled = true;
    };
  }, [
    currentUser?.id,
    isConfigured,
    isTester,
    stateVisibilitySubmission,
    visibilitySummary?.submissionId,
  ]);

  useEffect(() => {
    let isCancelled = false;

    if (
      !currentUser ||
      !isConfigured ||
      isTester ||
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
  }, [currentUser?.id, isConfigured, isTester, visibilitySummary?.satisfactionRatePercent]);

  useEffect(() => {
    if (!currentUser) {
      setSelectedProductTypes(defaultSelectedProductTypes);
      setPendingProductTypes(defaultSelectedProductTypes);
      setIsPlatformModalOpen(false);
      return;
    }

    if (currentUser.accountType === "tester" && currentUser.testerProfile) {
      const nextProductTypes = devicesToProductTypes(currentUser.testerProfile.devices);
      setSelectedProductTypes(nextProductTypes);
      setPendingProductTypes(nextProductTypes);
      setIsPlatformModalOpen(false);
      return;
    }

    const storedProductTypes = readStoredProductTypes(currentUser.id);
    const isConfirmed = readStoredPlatformConfirmation(currentUser.id);
    const nextSelectedProductTypes = storedProductTypes ?? defaultSelectedProductTypes;

    setSelectedProductTypes(nextSelectedProductTypes);
    setPendingProductTypes(nextSelectedProductTypes);
    setIsPlatformModalOpen(!isConfirmed);
  }, [
    currentUser?.accountType,
    currentUser?.id,
    currentUser?.testerProfile?.devices,
    defaultSelectedProductTypesKey,
  ]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentUser || !isConfigured) {
      setServerEarnSubmissions(null);
      setIsLoadingServerEarnSubmissions(false);
      setServerEarnError("");
      return undefined;
    }

    if (selectedProductTypes.length === 0) {
      setServerEarnSubmissions([]);
      setIsLoadingServerEarnSubmissions(false);
      setServerEarnError("");
      return undefined;
    }

    const loadServerEarnSubmissions = async () => {
      setIsLoadingServerEarnSubmissions(true);

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
      } finally {
        if (!isCancelled) {
          setIsLoadingServerEarnSubmissions(false);
        }
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

  const togglePendingProductType = (productType: ProductType) => {
    setPendingProductTypes(
      pendingProductTypes.includes(productType)
        ? pendingProductTypes.filter((item) => item !== productType)
        : [...pendingProductTypes, productType],
    );
  };

  const closePlatformModal = () => {
    setPendingProductTypes(selectedProductTypes);
    setIsPlatformModalOpen(false);
  };

  const savePlatformSelection = async (productTypes: ProductType[], closeModal = false) => {
    const next = normalizeProductTypes(productTypes);

    if (isTester && currentUser?.testerProfile) {
      const profile = currentUser.testerProfile;
      const result = await updateTesterProfile({
        firstName: profile.firstName,
        countryCode: profile.countryCode,
        region: profile.region ?? "",
        technologyProficiency: profile.technologyProficiency,
        devices: productTypesToDevices(next),
        employmentStatus: profile.employmentStatus,
        workArea: profile.workArea ?? "",
        paidTestEmailEnabled: profile.paidTestEmailEnabled,
      });

      if (!result.ok) {
        setServerEarnError(result.message);
        return;
      }
    } else if (currentUser) {
      saveStoredProductTypes(currentUser.id, next);
      saveStoredPlatformConfirmation(currentUser.id);
    }

    setSelectedProductTypes(next);
    setPendingProductTypes(next);
    if (closeModal) {
      setIsPlatformModalOpen(false);
    }
    setServerEarnError("");
  };

  const toggleSelectedProductType = (productType: ProductType) => {
    const next = selectedProductTypes.includes(productType)
      ? selectedProductTypes.filter((item) => item !== productType)
      : [...selectedProductTypes, productType];

    void savePlatformSelection(next);
  };

  const confirmPlatformSelection = () => {
    void savePlatformSelection(pendingProductTypes, true);
  };

  const candidateSubmissions = useMemo(() => {
    if (selectedProductTypes.length === 0) {
      return [];
    }

    const hiddenReportedSubmissions = new Set(hiddenReportedSubmissionIds);

    const baseSubmissions = serverEarnSubmissions ?? available;

    return baseSubmissions.filter(
      (item) =>
        !hiddenReportedSubmissions.has(item.id) &&
        (!isTester ||
          item.rewardType === (testerAccessSummary?.paidAccessUnlocked ? "paid" : "credit")) &&
        (serverEarnSubmissions !== null ||
          (item.needsGooglePlayClosedTesters === isGooglePlayClosedTestPool &&
            googlePlayClosedTestPoolUserIds.has(item.userId ?? "") ===
              isGooglePlayClosedTestPool)) &&
        item.productTypes.some((productType) => selectedProductTypes.includes(productType)),
    );
  }, [
    available,
    googlePlayClosedTestPoolUserIds,
    hiddenReportedSubmissionIds,
    isGooglePlayClosedTestPool,
    isTester,
    testerAccessSummary?.paidAccessUnlocked,
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
        "recommended",
        reputationBySubmissionId[first.id],
        reputationBySubmissionId[second.id],
      ),
    );

    return next;
  }, [candidateSubmissions, reputationBySubmissionId]);

  const displayedSubmissionIdsKey = useMemo(
    () => [...new Set(displayedSubmissions.map((item) => item.id))].sort().join("|"),
    [displayedSubmissions],
  );

  useEffect(() => {
    let isCancelled = false;
    const submissionIds = candidateSubmissionIdsKey ? candidateSubmissionIdsKey.split("|") : [];

    if (!isConfigured || !currentUser || isTester || submissionIds.length === 0) {
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
  }, [candidateSubmissionIdsKey, currentUser?.id, isConfigured, isTester]);

  useEffect(() => {
    let isCancelled = false;
    const submissionIds = displayedSubmissionIdsKey ? displayedSubmissionIdsKey.split("|") : [];

    if (!currentUser || submissionIds.length === 0) {
      setDraftProgressBySubmissionId({});
      return undefined;
    }

    const loadDraftProgress = async () => {
      const progress = await loadTestResponseDraftProgress(currentUser.id, submissionIds, {
        skipServer: designSystemFixturesEnabled,
      });

      if (isCancelled) {
        return;
      }

      setDraftProgressBySubmissionId(progress);
    };

    void loadDraftProgress();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, designSystemFixturesEnabled, displayedSubmissionIdsKey]);

  const cards = useMemo<EarnSubmissionCard[]>(
    () =>
      displayedSubmissions.map((submission) => ({
        submission,
        reputation: reputationBySubmissionId[submission.id] ?? null,
      })),
    [displayedSubmissions, reputationBySubmissionId],
  );
  const privatePlacementSubmission = useMemo(
    () =>
      visibilitySummary?.submissionId && visibilitySubmission?.id === visibilitySummary.submissionId
        ? visibilitySubmission
        : stateVisibilitySubmission,
    [stateVisibilitySubmission, visibilitySubmission, visibilitySummary?.submissionId],
  );
  const privatePlacementRank = visibilitySummary?.wouldRank ?? visibilitySummary?.rank ?? null;
  const shouldShowPrivatePlacement = Boolean(
    !isTester && currentUser && visibilitySummary?.submissionId && visibilitySummary.productName,
  );
  const privatePlacementIndex = privatePlacementRank
    ? Math.min(Math.max(privatePlacementRank - 1, 0), cards.length)
    : 0;
  const earnStartPlacementSnapshot = useMemo<EarnPlacementSnapshot | null>(() => {
    if (!visibilitySummary?.submissionId) {
      return null;
    }

    return {
      ownerSubmissionId: visibilitySummary.submissionId,
      previousWouldRank: visibilitySummary.wouldRank,
      previousWouldRankedSubmissionCount: visibilitySummary.wouldRankedSubmissionCount,
      capturedAt: new Date().toISOString(),
    };
  }, [
    visibilitySummary?.submissionId,
    visibilitySummary?.wouldRank,
    visibilitySummary?.wouldRankedSubmissionCount,
  ]);
  const celebrationSnapshot = creditCelebration?.placementSnapshot ?? null;
  const snapshotMatchesCurrentSubmission =
    !celebrationSnapshot?.ownerSubmissionId ||
    celebrationSnapshot.ownerSubmissionId === visibilitySummary?.submissionId;
  const previousPrivateRank = snapshotMatchesCurrentSubmission
    ? (celebrationSnapshot?.previousWouldRank ?? null)
    : null;
  const didPrivatePlacementImprove = Boolean(
    previousPrivateRank && privatePlacementRank && privatePlacementRank < previousPrivateRank,
  );
  const privatePlacementAnimationMode =
    creditCelebration && shouldShowPrivatePlacement
      ? didPrivatePlacementImprove
        ? "rise"
        : "pulse"
      : null;
  const privatePlacementOffsetPx =
    didPrivatePlacementImprove && previousPrivateRank && privatePlacementRank
      ? Math.min(
          (previousPrivateRank - privatePlacementRank) * EARN_PRIVATE_PLACEMENT_ROW_OFFSET_PX,
          EARN_PRIVATE_PLACEMENT_MAX_OFFSET_PX,
        )
      : 0;

  const firstTestBackCard = useMemo(
    () => cards.find((card) => card.reputation?.ownerHasTestedYou === true) ?? null,
    [cards],
  );
  const firstAvailableTestCard = cards[0] ?? null;

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

  const scrollToFirstAvailableTest = () => {
    if (!firstAvailableTestCard) {
      return;
    }

    const target = reciprocalRowRefs.current[firstAvailableTestCard.submission.id];

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const saveVisibilitySubmissionDetails = async (submissionId: string, draft: SubmissionDraft) => {
    const currentStatus =
      editingVisibilitySubmission?.id === submissionId
        ? editingVisibilitySubmission.status
        : undefined;
    await updateSubmissionDetails(submissionId, draft, currentStatus);

    if (!isConfigured) {
      return;
    }

    try {
      const updatedSubmission = await loadEarnVisibilitySubmission(submissionId);
      setVisibilitySubmission(updatedSubmission);

      if (updatedSubmission) {
        setVisibilitySummary((current) =>
          current?.submissionId === submissionId
            ? { ...current, productName: updatedSubmission.productName }
            : current,
        );
      }
    } catch (error) {
      console.error(error);
    }
  };

  const openVisibilityEditModal = (submissionId: string) => {
    setEditLinkError("");
    setEditingVisibilitySubmissionId(submissionId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("edit", submissionId);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const closeVisibilityEditModal = () => {
    setEditingVisibilitySubmissionId(null);
    setDeepLinkSubmission(null);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("edit");
    setSearchParams(nextSearchParams, { replace: true });
  };

  useEffect(() => {
    if (!creditCelebration || !shouldShowPrivatePlacement) {
      return undefined;
    }

    const scrollTimer = window.setTimeout(() => {
      const target = privatePlacementRowRef.current;

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: userPrefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
      target.focus({ preventScroll: true });
    }, 260);

    return () => window.clearTimeout(scrollTimer);
  }, [
    creditCelebration,
    privatePlacementRank,
    privatePlacementSubmission?.id,
    shouldShowPrivatePlacement,
  ]);

  const leadingCards = shouldShowPrivatePlacement ? cards.slice(0, privatePlacementIndex) : cards;
  const trailingCards = shouldShowPrivatePlacement ? cards.slice(privatePlacementIndex) : [];
  const isShowingInitialEarnLoad =
    isLoadingServerEarnSubmissions &&
    serverEarnSubmissions === null &&
    cards.length === 0 &&
    selectedProductTypes.length > 0;

  return (
    <AppShell>
      <Toast open={showCreditToast} tone="success" title="Credit earned">
        {EARN_CREDIT_CELEBRATION_COPY}
      </Toast>
      <div className={styles.page}>
        <h1 className="ds-sr-only">Earn</h1>
        {!isTester && editLinkError ? (
          <Alert title="App could not be opened" tone="warning">
            {editLinkError}
          </Alert>
        ) : null}
        {isTester ? (
          <TesterEarnProgress
            summary={testerAccessSummary}
            isLoading={isLoadingTesterAccess}
            error={testerAccessError}
          />
        ) : (
          <EarnVisibilityPanel
            summary={visibilitySummary}
            error={visibilityError}
            isSignedIn={Boolean(currentUser)}
            hasTestBackTarget={Boolean(firstTestBackCard)}
            hasAvailableTest={Boolean(firstAvailableTestCard)}
            revisionTargetResponseId={revisionTargetResponseId}
            revisionTargetError={revisionTargetError}
            isLoadingRevisionTarget={isLoadingRevisionTarget}
            onImproveRate={scrollToFirstTestBackTarget}
            onCompleteTest={scrollToFirstAvailableTest}
            onEditLiveTest={openVisibilityEditModal}
            onShare={() => navigate("/share")}
          />
        )}

        <div className="earn-filters">
          <span className="earn-filters__rule" aria-hidden="true" />
          <Button
            type="button"
            variant="quiet"
            className="earn-filters__toggle"
            aria-expanded={areFiltersOpen}
            aria-controls="earn-platform-filters"
            onClick={() => {
              setAreFiltersOpen((isOpen) => !isOpen);
              setSuppressedPlatformHoverType(null);
            }}
          >
            <span>Filters</span>
            {areFiltersOpen ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </Button>
          {areFiltersOpen ? (
            <fieldset id="earn-platform-filters" className="earn-platform-filter-list">
              <legend className="ds-sr-only">Choose platforms you can test</legend>
              {PRODUCT_TYPE_ORDER.map((productType) => (
                <Checkbox
                  key={productType}
                  className={`earn-platform-filter-choice${
                    suppressedPlatformHoverType === productType
                      ? ` ${styles.platformFilterHoverSuppressed}`
                      : ""
                  }`}
                  checked={selectedProductTypes.includes(productType)}
                  onClick={(event) => {
                    if (event.detail > 0) {
                      if (selectedProductTypes.includes(productType)) {
                        setSuppressedPlatformHoverType(productType);
                      }
                      event.currentTarget.blur();
                    }
                  }}
                  onPointerLeave={() =>
                    setSuppressedPlatformHoverType((currentType) =>
                      currentType === productType ? null : currentType,
                    )
                  }
                  label={
                    <span className="earn-platform-filter-choice__content">
                      <PlatformMark productType={productType} />
                      <span>
                        {productType === "website" ? "Web" : earnPlatformLabel(productType)}
                      </span>
                    </span>
                  }
                  onChange={() => toggleSelectedProductType(productType)}
                />
              ))}
            </fieldset>
          ) : null}
        </div>

        {serverEarnError ? (
          <Surface as="section" tone="subtle" className="callout callout--warning">
            {serverEarnError}
          </Surface>
        ) : null}

        {cards.length > 0 || shouldShowPrivatePlacement ? (
          <div className="earn-list">
            {leadingCards.map((card) => (
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
                  placementSnapshot={earnStartPlacementSnapshot}
                  showFounderReputation={!isTester}
                />
              </div>
            ))}
            {shouldShowPrivatePlacement && visibilitySummary ? (
              <div
                ref={privatePlacementRowRef}
                className="earn-row-anchor earn-row-anchor--private-placement"
                tabIndex={-1}
              >
                <EarnPrivatePlacementRow
                  summary={visibilitySummary}
                  submission={privatePlacementSubmission}
                  animationMode={privatePlacementAnimationMode}
                  animationOffsetPx={privatePlacementOffsetPx}
                />
              </div>
            ) : null}
            {trailingCards.map((card) => (
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
                  placementSnapshot={earnStartPlacementSnapshot}
                  showFounderReputation={!isTester}
                />
              </div>
            ))}
          </div>
        ) : isShowingInitialEarnLoad ? (
          <Surface as="section">
            <div className="empty-state">
              <h3>Loading tests...</h3>
            </div>
          </Surface>
        ) : (
          <Surface as="section">
            <div className="empty-state">
              {isTester ? (
                <>
                  {testerAccessSummary?.paidAccessUnlocked ? (
                    <h3>No paid tests are available right now</h3>
                  ) : (
                    <h3>No credit tests are available right now</h3>
                  )}
                  <p>
                    {testerAccessSummary?.paidAccessUnlocked
                      ? "Test4Test will email you when a new matching paid test appears."
                      : "Check back soon or edit your device preferences to see other credit tests."}
                  </p>
                </>
              ) : selectedProductTypes.length === 0 ? (
                <>
                  <h3>No platforms selected</h3>
                  <p>Select at least one platform to see matching tests.</p>
                </>
              ) : (
                <>
                  <h3>No matching tests right now</h3>
                  <p>
                    Try a different filter or publish your own product so the exchange loop keeps
                    moving.
                  </p>
                  <Link to="/submit" className="button button--primary">
                    Submit your app
                  </Link>
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
      {!isTester && editingVisibilitySubmission ? (
        <EditSubmissionModal
          submission={editingVisibilitySubmission}
          onClose={closeVisibilityEditModal}
          onSave={saveVisibilitySubmissionDetails}
        />
      ) : null}
    </AppShell>
  );
}
function TesterEarnProgress({
  summary,
  isLoading,
  error,
}: {
  summary: TesterEarnAccessSummary | null;
  isLoading: boolean;
  error: string;
}) {
  const completedCreditTests = Math.min(summary?.completedCreditTests ?? 0, 2);
  const fiveStarRatings = Math.min(summary?.fiveStarRatings ?? 0, 2);
  const isUnlocked = summary?.paidAccessUnlocked === true;

  return (
    <Surface as="section" className={styles.testerProgress} aria-labelledby="tester-progress-title">
      <div className={styles.testerProgressHeader}>
        <div>
          <h2 id="tester-progress-title">
            {isUnlocked ? "Paid tests unlocked" : "Your paid-test progress"}
          </h2>
          <p>
            {isLoading
              ? "Loading your progress..."
              : isUnlocked
                ? "You qualify for paid tests that match your devices."
                : "Complete two credited tests and receive two 5-star ratings to unlock paid tests."}
          </p>
        </div>
        <Badge tone={isUnlocked ? "success" : "info"}>
          {isUnlocked ? "Unlocked" : "Credit tests"}
        </Badge>
      </div>
      {error ? (
        <Alert title="Progress unavailable" tone="warning">
          {error}
        </Alert>
      ) : null}
      <div className={styles.testerProgressGrid}>
        <Progress
          label={`Credited tests: ${completedCreditTests} of 2`}
          value={completedCreditTests}
          max={2}
        />
        <Progress
          label={`5-star ratings: ${fiveStarRatings} of 2`}
          value={fiveStarRatings}
          max={2}
        />
      </div>
    </Surface>
  );
}

function EarnRankPanelBackground() {
  return (
    // ds-exception: earn-rank-panel-gradient
    <svg
      className={styles.rankPanelBackground}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="earn-rank-panel-right-fade" x1="0" y1="0" x2="1" y2="0">
          <stop
            offset="0.48"
            stopColor="var(--ds-semantic-color-surface-default)"
            stopOpacity="0"
          />
          <stop offset="1" stopColor="var(--ds-semantic-color-surface-default)" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="earn-rank-panel-top-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ds-semantic-color-surface-default)" stopOpacity="1" />
          <stop
            offset="0.42"
            stopColor="var(--ds-semantic-color-surface-default)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <rect
        width="1"
        height="1"
        fill="color-mix(in srgb, var(--ds-semantic-color-action-tint) 70%, var(--ds-semantic-color-surface-default))"
      />
      <rect width="1" height="1" fill="url(#earn-rank-panel-right-fade)" />
      <rect width="1" height="1" fill="url(#earn-rank-panel-top-fade)" />
    </svg>
  );
}

function EarnVisibilityPanel({
  summary,
  error,
  isSignedIn,
  hasTestBackTarget,
  hasAvailableTest,
  revisionTargetResponseId,
  revisionTargetError,
  isLoadingRevisionTarget,
  onImproveRate,
  onCompleteTest,
  onEditLiveTest,
  onShare,
}: {
  summary: EarnVisibilitySummary | null;
  error: string;
  isSignedIn: boolean;
  hasTestBackTarget: boolean;
  hasAvailableTest: boolean;
  revisionTargetResponseId: string | null;
  revisionTargetError: string;
  isLoadingRevisionTarget: boolean;
  onImproveRate: () => void;
  onCompleteTest: () => void;
  onEditLiveTest: (submissionId: string) => void;
  onShare: () => void;
}) {
  const hasLiveTest = Boolean(summary?.submissionId);
  const hasCompletedTest = summary?.hasCompletedTest === true;
  const isListingLocked = Boolean(summary && hasLiveTest && !hasCompletedTest);
  const hideMetricValues = Boolean(summary && !hasCompletedTest);
  const showImproveRate = Boolean(summary && hasCompletedTest && summary.testBackRatePercent < 100);
  const showReviseReview = Boolean(
    summary && hasCompletedTest && summary.satisfactionRatePercent < 100,
  );
  const rankValue = !summary
    ? "..."
    : isListingLocked
      ? "Your app isn't listed yet..."
      : hasLiveTest && summary.rank
        ? `#${summary.rank}`
        : "--";
  const rankDetail = !summary
    ? "Loading Rank"
    : isListingLocked
      ? null
      : hasLiveTest && summary.rank
        ? null
        : hasLiveTest
          ? "Not visible on Earn right now"
          : "Submit an app to earn a Rank";
  const appName = summary?.productName ?? (summary ? "No live test" : "Loading your visibility");
  const liveSubmissionId = summary?.submissionId ?? null;
  const testBackValue = !summary
    ? "..."
    : hideMetricValues
      ? "--"
      : `${summary.testBackRatePercent}%`;
  const satisfactionValue = !summary
    ? "..."
    : hideMetricValues
      ? "--"
      : `${summary.satisfactionRatePercent}%`;
  const creditValue = !summary ? "..." : hideMetricValues ? "--" : summary.tokenBalance;

  if (!isSignedIn) {
    return (
      <Surface as="section" tone="raised" padding="none" className="earn-visibility">
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
    <Surface as="section" tone="raised" padding="none" className="earn-visibility">
      <div className="earn-visibility__app-bar">
        <div className="earn-visibility__app-name">
          <h2>{appName}</h2>
        </div>
        {hasLiveTest && liveSubmissionId ? (
          <div className="earn-visibility__app-actions">
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => onEditLiveTest(liveSubmissionId)}
            >
              <PencilLine size={16} aria-hidden="true" />
              Edit
            </Button>
            <Button type="button" variant="secondary" size="compact" onClick={onShare}>
              <Share2 size={16} aria-hidden="true" />
              Share
            </Button>
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
        <div
          className={`earn-visibility__rank-panel${isListingLocked ? " earn-visibility__rank-panel--locked" : ""}`}
        >
          <EarnRankPanelBackground />
          <div
            className={`earn-visibility__rank-value${isListingLocked ? " earn-visibility__rank-value--message" : ""}`}
          >
            <strong>
              <span className="ds-sr-only">Rank </span>
              {rankValue}
            </strong>
          </div>
          <span className={styles.rankInfoPlacement}>
            <Tooltip content="Rank is based on your test-back rate, satisfaction rate, and available credits.">
              <IconButton
                label="How Earn ranking works"
                variant="quiet"
                className={styles.rankInfoTrigger}
              >
                <Info size={16} aria-hidden="true" />
              </IconButton>
            </Tooltip>
          </span>
          {isListingLocked ? (
            <Button
              type="button"
              size="compact"
              className="earn-visibility__rank-action"
              onClick={onCompleteTest}
              disabled={!hasAvailableTest}
            >
              Complete a test
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : rankDetail ? (
            <small>{rankDetail}</small>
          ) : null}
        </div>

        <div className="earn-visibility__details">
          <div className="earn-visibility__detail-row">
            <strong>{testBackValue}</strong>
            <span className="earn-visibility__metric-label">Test-back rate</span>
            {showImproveRate ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                className="earn-visibility__inline-action"
                onClick={onImproveRate}
                disabled={!hasTestBackTarget}
              >
                Improve rate
              </Button>
            ) : null}
          </div>
          {showImproveRate && !hasTestBackTarget ? (
            <small className="earn-visibility__detail-note">
              No available test-back target right now.
            </small>
          ) : null}

          <div className="earn-visibility__detail-row earn-visibility__detail-row--action">
            <strong>{satisfactionValue}</strong>
            <span className="earn-visibility__metric-label">Satisfaction rate</span>
            {showReviseReview ? (
              revisionTargetResponseId ? (
                <Link
                  to={`/submissions/${revisionTargetResponseId}/revise`}
                  className="button button--secondary button--small earn-visibility__inline-action"
                >
                  Revise
                </Link>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="earn-visibility__inline-action"
                  disabled
                >
                  Revise
                </Button>
              )
            ) : null}
          </div>
          {showReviseReview && isLoadingRevisionTarget ? (
            <small className="earn-visibility__detail-note">Finding review...</small>
          ) : null}
          {showReviseReview && !isLoadingRevisionTarget && revisionTargetError ? (
            <small className="earn-visibility__detail-note">{revisionTargetError}</small>
          ) : null}
          {showReviseReview &&
          !isLoadingRevisionTarget &&
          !revisionTargetResponseId &&
          !revisionTargetError ? (
            <small className="earn-visibility__detail-note">
              No revisable low or okay reviews right now.
            </small>
          ) : null}

          <div className="earn-visibility__detail-row">
            <strong>{creditValue}</strong>
            <span className="earn-visibility__metric-label">Credits</span>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function PlatformAccessIllustration() {
  return (
    // ds-exception: earn-platform-modal-mockup-treatment
    <svg className="earn-platform-modal__illustration" viewBox="8 8 96 60" aria-hidden="true">
      <g className="earn-platform-modal__sparkles" aria-hidden="true">
        <path d="M14 14h8M18 10v8" />
        <path d="M94 17h6M97 14v6" />
        <path d="M17 53h5M19.5 50.5v5" />
        <path d="M97 58h7M100.5 54.5v7" />
      </g>
      <g className="earn-platform-modal__device-outline" aria-hidden="true">
        <rect x="24" y="16" width="57" height="40" rx="5" />
        <path d="M45 65h19M51 56v9M59 56v9" />
        <path className="earn-platform-modal__device-check" d="m42 34 6 6 12-13" />
        <rect x="74" y="28" width="22" height="37" rx="4" />
        <path d="M81 59h8" />
        <path className="earn-platform-modal__device-check" d="m80 43 4 4 7-8" />
      </g>
    </svg>
  );
}

function PlatformMark({ productType }: { productType: ProductType }) {
  if (productType === "website") {
    return (
      <span className="earn-platform-choice__mark earn-platform-choice__mark--website">
        <Globe2 aria-hidden="true" size={24} />
      </span>
    );
  }

  if (productType === "ios") {
    return (
      <span className="earn-platform-choice__mark earn-platform-choice__mark--ios">
        {/* ds-exception: earn-platform-modal-mockup-treatment */}
        <svg viewBox="6 2 17 23" aria-hidden="true">
          <path d="M19.66 13.17c-.02-2.26 1.85-3.36 1.94-3.42-1.06-1.55-2.71-1.76-3.3-1.78-1.39-.15-2.74.83-3.45.83-.72 0-1.82-.81-2.99-.79-1.51.02-2.93.9-3.71 2.29-1.6 2.77-.41 6.84 1.13 9.08.77 1.1 1.67 2.33 2.84 2.29 1.14-.05 1.57-.73 2.96-.73 1.38 0 1.77.73 2.96.7 1.23-.02 2-1.1 2.74-2.21.89-1.27 1.25-2.53 1.27-2.59-.03-.01-2.37-.92-2.39-3.67Zm-2.26-6.67c.62-.77 1.04-1.81.93-2.87-.9.04-2.03.62-2.68 1.37-.58.66-1.09 1.74-.96 2.76 1.02.08 2.07-.52 2.71-1.26Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className="earn-platform-choice__mark earn-platform-choice__mark--android">
      {/* ds-exception: earn-platform-modal-mockup-treatment */}
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <path d="m8.1 7.2-1.8-2.6a.8.8 0 0 1 .2-1.1.8.8 0 0 1 1.1.2l1.9 2.7A10.6 10.6 0 0 1 14 5.2c1.6 0 3.1.4 4.5 1.1l1.9-2.7a.8.8 0 0 1 1.1-.2.8.8 0 0 1 .2 1.1l-1.8 2.6A8.4 8.4 0 0 1 23 13H5a8.4 8.4 0 0 1 3.1-5.8ZM10 9.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM5 14.5h18v7.2c0 1.2-1 2.1-2.1 2.1h-1.1V27h-2.5v-3.2h-6.6V27H8.2v-3.2H7.1c-1.2 0-2.1-1-2.1-2.1v-7.2Zm-3 0h2v7.2a1 1 0 0 1-2 0v-7.2Zm22 0h2v7.2a1 1 0 0 1-2 0v-7.2Z" />
      </svg>
    </span>
  );
}

function EarnPlatformModalBackground() {
  return (
    // ds-exception: earn-platform-modal-mockup-treatment
    <svg
      className="earn-platform-modal__background"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="earn-platform-modal-background" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            stopColor="color-mix(in srgb, var(--ds-semantic-color-action-tint) 55%, var(--ds-semantic-color-surface-default))"
          />
          <stop offset="0.72" stopColor="var(--ds-semantic-color-surface-default)" />
        </linearGradient>
      </defs>
      <rect width="1" height="1" fill="url(#earn-platform-modal-background)" />
    </svg>
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="earn-platform-modal"
      title={
        <span className="earn-platform-modal__title">
          <PlatformAccessIllustration />
          <span>What platforms can you reliably access?</span>
        </span>
      }
      description={
        <span className="earn-platform-modal__description">
          It&apos;s important to keep your preferences up to date so it&apos;s easy to test back
          other users.
        </span>
      }
      footer={
        <div className="earn-platform-modal__footer">
          <p className="earn-platform-modal__helper">
            <Info aria-hidden="true" size={16} />
            <span>You can update this anytime.</span>
          </p>
          <Button
            className="earn-platform-modal__button"
            size="compact"
            fullWidth
            onClick={onConfirm}
          >
            Save preferences
            <ArrowRight aria-hidden="true" size={16} />
          </Button>
        </div>
      }
    >
      <EarnPlatformModalBackground />
      <fieldset className="earn-platform-choice-list">
        <legend className="ds-sr-only">Platforms you can test</legend>
        {PRODUCT_TYPE_ORDER.map((productType) => {
          const isSelected = selectedProductTypes.includes(productType);
          return (
            <Checkbox
              key={productType}
              className="earn-platform-choice"
              checked={isSelected}
              label={
                <span className="earn-platform-choice__content">
                  <PlatformMark productType={productType} />
                  <span>{earnPlatformLabel(productType)}</span>
                  <span className="earn-platform-choice__selected" aria-hidden="true">
                    <Check size={16} />
                  </span>
                </span>
              }
              onChange={() => onToggle(productType)}
            />
          );
        })}
      </fieldset>
    </Dialog>
  );
}

function EarnPrivatePlacementRow({
  summary,
  submission,
  animationMode,
  animationOffsetPx,
}: {
  summary: EarnVisibilitySummary;
  submission: Submission | null;
  animationMode: "rise" | "pulse" | null;
  animationOffsetPx: number;
}) {
  const productName = submission?.productName ?? summary.productName ?? "Your test";
  const description =
    submission?.description || "This is your private placement preview on the Earn page.";
  const placementClasses = [
    "earn-row",
    "earn-row--private-placement",
    animationMode === "rise" ? "earn-row--private-placement-rise" : "",
    animationMode === "pulse" ? "earn-row--private-placement-pulse" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const placementStyle = {
    "--private-placement-offset": `${animationOffsetPx}px`,
  } as CSSProperties;

  // ds-exception: runtime-measurements — measured placement offset for the private row.
  return (
    <Surface as="section" padding="none" className={placementClasses} style={placementStyle}>
      <div className="earn-row__content">
        <div className="earn-row__main">
          <div className="earn-row__pills">
            <EarnBadge tone="success">Only visible to you</EarnBadge>
            {submission
              ? productTypesBadges(submission.productTypes).map((badge) => (
                  <EarnBadge key={`${submission.id}-${badge}`} tone="info">
                    {badge}
                  </EarnBadge>
                ))
              : null}
            {submission?.needsGooglePlayClosedTesters ? (
              <EarnBadge tone="warning">Google Play closed test</EarnBadge>
            ) : null}
          </div>
          <div className="earn-row__head">
            <h3>{productName}</h3>
            <p>{description}</p>
            {!summary.hasCompletedTest ? (
              <p className="earn-row__private-note">
                Private preview of where your test will appear after you complete one credited test.
              </p>
            ) : null}
          </div>
        </div>
        <div className="earn-row__aside earn-row__aside--private-placement">
          <Link to="/analytics" className="button button--secondary">
            View analytics
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </Surface>
  );
}

function EarnRow({
  card,
  hasDraftProgress,
  placementSnapshot,
  showFounderReputation,
}: {
  card: EarnSubmissionCard;
  hasDraftProgress: boolean;
  placementSnapshot: EarnPlacementSnapshot | null;
  showFounderReputation: boolean;
}) {
  const { submission, reputation } = card;
  const showReciprocalTag = showFounderReputation && reputation?.ownerHasTestedYou === true;
  const showRateReputation = showFounderReputation && reputation?.ownerHasCompletedTest === true;

  const savePlacementSnapshot = () => {
    if (!placementSnapshot) {
      return;
    }

    saveEarnPlacementSnapshot({
      ...placementSnapshot,
      capturedAt: new Date().toISOString(),
    });
  };

  return (
    <Surface as="article" padding="none" className="earn-row">
      <div className="earn-row__content">
        <div className="earn-row__main">
          <div className="earn-row__pills">
            {showReciprocalTag ? (
              <EarnBadge tone="warning">This user tested your app</EarnBadge>
            ) : null}
            {submission.rewardType === "paid" ? (
              <EarnBadge tone="success">Paid test</EarnBadge>
            ) : null}
            {productTypesBadges(submission.productTypes).map((badge) => (
              <EarnBadge key={`${submission.id}-${badge}`} tone="info">
                {badge}
              </EarnBadge>
            ))}
            {submission.needsGooglePlayClosedTesters ? (
              <EarnBadge tone="warning">Google Play closed test</EarnBadge>
            ) : null}
          </div>
          <div className="earn-row__head">
            <h3>{submission.productName}</h3>
            <p>
              {submission.description ||
                "Open the app, move through the main experience, and share thoughtful usability feedback."}
            </p>
            {submission.needsGooglePlayClosedTesters ? (
              <p className="earn-row__closed-test-note">
                Google Play closed test: join the Android test and check in once a day for 14
                consecutive days.
              </p>
            ) : null}
          </div>
        </div>
        <div className="earn-row__aside">
          <Link
            to={`/test/${submission.id}`}
            className="button button--primary"
            onClick={savePlacementSnapshot}
          >
            {hasDraftProgress ? "Resume test" : "View test"}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {showRateReputation && reputation ? (
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
