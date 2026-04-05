import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { getPrimaryAccessLink, normalizeAccessLinks, normalizeProductTypes, productTypesBadges } from "../lib/format";
import {
  clearPendingSubmission,
  clearStoredOtpChallenge,
  createPendingSubmissionId,
  getPendingSubmission,
  getStoredOtpChallenge,
  savePendingSubmission,
  storeOtpChallenge,
} from "../lib/pendingSubmission";
import { estimateMinutes } from "../lib/questions";
import { notifySubmissionOwnerAboutNewResult } from "../lib/testResultNotifications";
import { wait } from "../lib/timing";
import { getCurrentUser } from "../lib/selectors";
import { hasSupabaseConfig, requireSupabase } from "../lib/supabase";
import {
  AppState,
  CreditTransaction,
  FeedbackRatingValue,
  ModerationAction,
  OTPChallenge,
  PaymentMethods,
  Question,
  QuestionMode,
  Submission,
  SubmissionDraft,
  TestAnswer,
  TestResponse,
  User,
} from "../types";

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  ban_status: User["banStatus"];
  banned_at: string | null;
  paypal_handle?: string | null;
  venmo_handle?: string | null;
  cash_app_handle?: string | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
  product_type?: Submission["productTypes"][number] | null;
  product_types?: Submission["productTypes"] | null;
  description: string;
  target_audience: string;
  instructions: string;
  access_links?: Submission["accessLinks"] | null;
  access_url: string;
  access_method: string;
  status: Submission["status"];
  question_mode: Submission["questionMode"];
  is_open_for_more_tests: boolean;
  estimated_minutes: number;
  response_count: number;
  last_response_at: string | null;
  promoted?: boolean | null;
  created_at: string;
}

interface QuestionSetVersionRow {
  id: string;
  submission_id: string;
  version_number: number;
  created_at: string;
  is_active: boolean;
  mode: QuestionMode;
  questions: Question[];
}

interface TestResponseRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  question_set_version_id: string;
  anonymous_label: string;
  status: TestResponse["status"];
  quality_score: number;
  credit_awarded: boolean;
  submitted_at: string;
  duration_seconds: number;
  answers: TestAnswer[];
  internal_flags: string[];
}

interface FeedbackRatingRow {
  id: string;
  test_response_id: string;
  rated_by_user_id: string;
  rating_value: FeedbackRatingValue;
  created_at: string;
  updated_at: string;
}

interface CreditTransactionRow {
  id: string;
  user_id: string;
  type: CreditTransaction["type"];
  amount: number;
  reason: string;
  related_test_response_id?: string | null;
  created_at: string;
}

interface SubmissionRpcResult {
  responseId?: string;
  ok?: boolean;
  message?: string;
  status?: TestResponse["status"];
  qualityScore?: number;
  creditAwarded?: boolean;
}

interface AppStateContextValue {
  state: AppState;
  currentUser: User | null;
  isLoading: boolean;
  isConfigured: boolean;
  requestOtp: (email: string, submissionId?: string) => Promise<OTPChallenge>;
  verifyOtp: (
    code: string,
  ) => Promise<{ ok: boolean; message: string; submissionId?: string | null }>;
  createSubmission: (draft: SubmissionDraft, questions: Question[]) => Promise<string>;
  updateSubmissionDetails: (submissionId: string, draft: SubmissionDraft) => Promise<void>;
  completeTest: (
    submissionId: string,
    answers: TestAnswer[],
    durationSeconds: number,
  ) => Promise<{ ok: boolean; message: string }>;
  reviseTestResponse: (
    responseId: string,
    answers: TestAnswer[],
    durationSeconds: number,
  ) => Promise<{ ok: boolean; message: string }>;
  rateFeedback: (
    responseId: string,
    ratingValue: FeedbackRatingValue,
  ) => Promise<void>;
  updateQuestionSet: (
    submissionId: string,
    mode: QuestionMode,
    questions: Question[],
  ) => Promise<void>;
  addModerationAction: (
    responseId: string,
    userId: string,
    action: ModerationAction["action"],
    notes: string,
  ) => Promise<void>;
  resetDemo: () => Promise<void>;
  changeEmail: (nextEmail: string) => Promise<{ ok: boolean; message: string }>;
  updatePaymentMethods: (paymentMethods: PaymentMethods) => Promise<{ ok: boolean; message: string }>;
  deleteAccount: () => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<void>;
}

const OTP_REQUEST_DEDUPE_WINDOW_MS = 10000;

const emptyState: AppState = {
  currentUserId: null,
  users: [],
  submissions: [],
  questionSetVersions: [],
  responses: [],
  feedbackRatings: [],
  creditTransactions: [],
  emailLogs: [],
  moderationActions: [],
  otpChallenge: null,
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createOtpChallenge(email: string, submissionId?: string): OTPChallenge {
  return {
    id: createId("otp"),
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
    resendCount: 0,
    submissionId,
  };
}

function resolveDisplayName(email: string, authUser?: SupabaseAuthUser | null) {
  const metadataName =
    typeof authUser?.user_metadata?.display_name === "string"
      ? authUser.user_metadata.display_name
      : typeof authUser?.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : "";

  if (metadataName.trim()) {
    return metadataName.trim();
  }

  return email
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mapProfile(row: ProfileRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: "active",
    createdAt: row.created_at,
    banStatus: row.ban_status === "banned" ? "banned" : "clear",
    bannedAt: row.banned_at,
    paypalHandle: row.paypal_handle ?? null,
    venmoHandle: row.venmo_handle ?? null,
    cashAppHandle: row.cash_app_handle ?? null,
  };
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Question[];
  }

  return value.map((question, index) => {
    const current = question as Partial<Question>;

    return {
      id:
        typeof current.id === "string" && current.id.trim()
          ? current.id
          : `question-${index + 1}`,
      title: typeof current.title === "string" ? current.title : "Untitled question",
      type: current.type === "paragraph" ? "paragraph" : "multiple",
      required: current.required !== false,
      sortOrder:
        typeof current.sortOrder === "number" ? current.sortOrder : index + 1,
      options: Array.isArray(current.options)
        ? current.options.map((option) => String(option))
        : undefined,
    } satisfies Question;
  });
}

function mapSubmission(row: SubmissionRow): Submission {
  const accessLinks = normalizeAccessLinks(
    row.access_links && typeof row.access_links === "object"
      ? row.access_links
      : row.access_url && row.product_type
        ? { [row.product_type]: row.access_url }
        : {},
  );
  const productTypes = normalizeProductTypes(
    Array.isArray(row.product_types) && row.product_types.length > 0
      ? row.product_types
      : row.product_type
        ? [row.product_type]
        : (Object.keys(accessLinks) as Submission["productTypes"]),
  );

  return {
    id: row.id,
    userId: row.user_id,
    productName: row.product_name,
    productTypes,
    description: row.description ?? "",
    targetAudience: row.target_audience ?? "",
    instructions: row.instructions ?? "",
    accessLinks,
    status: row.status,
    questionMode: row.question_mode,
    isOpenForMoreTests: row.is_open_for_more_tests,
    promoted: row.promoted === true,
    createdAt: row.created_at,
    estimatedMinutes: row.estimated_minutes,
    responseCount: row.response_count ?? 0,
    lastResponseAt: row.last_response_at,
    tags: productTypesBadges(productTypes),
  };
}

function mapQuestionSetVersion(row: QuestionSetVersionRow) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    versionNumber: row.version_number,
    createdAt: row.created_at,
    isActive: row.is_active,
    mode: row.mode,
    questions: normalizeQuestions(row.questions),
  };
}

function mapTestResponse(row: TestResponseRow): TestResponse {
  return {
    id: row.id,
    submissionId: row.submission_id,
    testerUserId: row.tester_user_id,
    questionSetVersionId: row.question_set_version_id,
    anonymousLabel: row.anonymous_label,
    status: row.status,
    qualityScore: row.quality_score,
    creditAwarded: row.credit_awarded,
    submittedAt: row.submitted_at,
    durationSeconds: row.duration_seconds,
    answers: Array.isArray(row.answers) ? row.answers : [],
    internalFlags: Array.isArray(row.internal_flags) ? row.internal_flags : [],
  };
}

function mapFeedbackRating(row: FeedbackRatingRow) {
  return {
    id: row.id,
    testResponseId: row.test_response_id,
    ratedByUserId: row.rated_by_user_id,
    ratingValue: row.rating_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCreditTransaction(row: CreditTransactionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: row.amount,
    reason: row.reason,
    relatedTestResponseId: row.related_test_response_id ?? undefined,
    createdAt: row.created_at,
  };
}

function mergeUniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function hasUsableSession(session: Session | null | undefined): session is Session {
  if (!session?.access_token || !session.user) {
    return false;
  }

  if (typeof session.expires_at !== "number") {
    return true;
  }

  return session.expires_at > Math.floor(Date.now() / 1000) + 30;
}

async function ensureAuthenticatedSession(
  fallbackMessage = "Please sign in again to continue.",
) {
  const supabase = requireSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (hasUsableSession(session)) {
    return { supabase, session };
  }

  const {
    data: refreshed,
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (refreshError || !hasUsableSession(refreshed.session)) {
    throw new Error(fallbackMessage);
  }

  return {
    supabase,
    session: refreshed.session,
  };
}

const latestSubmissionSchemaMessage =
  "Your Supabase database is missing the latest submissions schema. Run the 20260331 migrations for product_types and access_links before creating submissions with multiple app links.";
const latestProfilePaymentSchemaMessage =
  "Your Supabase database is missing the latest payment methods schema. Run the 20260405 profile payment methods migration before saving payout details.";
const PAYMENT_METHOD_MAX_LENGTH = 120;
const profileBaseSelectClause = "id, email, display_name, ban_status, banned_at, created_at";
const profilePaymentSelectClause =
  `${profileBaseSelectClause}, paypal_handle, venmo_handle, cash_app_handle`;

function normalizeOptionalProfileText(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function normalizeVenmoHandle(value: string | null | undefined) {
  const trimmed = normalizeOptionalProfileText(value);

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^https?:\/\/(www\.)?venmo\.com\//i, "")
    .replace(/\s+/g, "")
    .replace(/^@+/, "");

  return normalized ? `@${normalized}` : null;
}

function normalizeCashAppHandle(value: string | null | undefined) {
  const trimmed = normalizeOptionalProfileText(value);

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^https?:\/\/(www\.)?cash\.app\/\$?/i, "")
    .replace(/\s+/g, "")
    .replace(/^\$+/, "");

  return normalized ? `$${normalized}` : null;
}

function normalizePaymentMethods(paymentMethods: PaymentMethods): Required<PaymentMethods> {
  return {
    paypalHandle: normalizeOptionalProfileText(paymentMethods.paypalHandle),
    venmoHandle: normalizeVenmoHandle(paymentMethods.venmoHandle),
    cashAppHandle: normalizeCashAppHandle(paymentMethods.cashAppHandle),
  };
}

function validatePaymentMethods(paymentMethods: Required<PaymentMethods>) {
  const labels: Record<keyof Required<PaymentMethods>, string> = {
    paypalHandle: "PayPal",
    venmoHandle: "Venmo",
    cashAppHandle: "Cash App",
  };

  for (const key of Object.keys(labels) as (keyof Required<PaymentMethods>)[]) {
    const value = paymentMethods[key];

    if (value && value.length > PAYMENT_METHOD_MAX_LENGTH) {
      return `${labels[key]} must be ${PAYMENT_METHOD_MAX_LENGTH} characters or fewer.`;
    }
  }

  return null;
}

function isMissingProfilePaymentSchemaError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('column "paypal_handle" of relation "profiles" does not exist') ||
    normalized.includes('column "venmo_handle" of relation "profiles" does not exist') ||
    normalized.includes('column "cash_app_handle" of relation "profiles" does not exist')
  );
}

function isMissingSubmissionSchemaError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('column "access_links" of relation "submissions" does not exist') ||
    normalized.includes('column "product_types" of relation "submissions" does not exist') ||
    normalized.includes("create_submission_with_questions") ||
    normalized.includes("p_product_types") ||
    normalized.includes("p_access_links")
  );
}

function isProfileAuthRace(error: { code?: string; message: string; details?: string | null }) {
  const details = error.details?.toLowerCase() ?? "";
  return error.code === "23503" && error.message.includes("profiles") && details.includes('key is not present in table "users"');
}

async function ensureProfile(authUser: SupabaseAuthUser) {
  const supabase = requireSupabase();
  const email = authUser.email ?? "";
  const displayName = resolveDisplayName(email, authUser);
  const retryDelays = [0, 150, 400];
  const profileUpsertPayload = {
    id: authUser.id,
    email,
    display_name: displayName,
  };
  let lastError: Error | null = null;

  for (const delay of retryDelays) {
    if (delay > 0) {
      await wait(delay);
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert(profileUpsertPayload, { onConflict: "id" })
      .select(profilePaymentSelectClause)
      .single();

    if (!error) {
      return mapProfile(data as ProfileRow);
    }

    if (isMissingProfilePaymentSchemaError(error.message)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("profiles")
        .upsert(profileUpsertPayload, { onConflict: "id" })
        .select(profileBaseSelectClause)
        .single();

      if (!fallbackError) {
        return mapProfile(fallbackData as ProfileRow);
      }

      if (isProfileAuthRace(fallbackError)) {
        lastError = new Error(
          "We verified your email, but your account is still finishing setup. Please wait a moment and try again.",
        );
        continue;
      }

      throw new Error(fallbackError.message);
    }

    if (isMissingSubmissionSchemaError(error.message)) {
      throw new Error(latestSubmissionSchemaMessage);
    }

    if (isProfileAuthRace(error)) {
      lastError = new Error(
        "We verified your email, but your account is still finishing setup. Please wait a moment and try again.",
      );
      continue;
    }

    throw new Error(error.message);
  }

  throw lastError ?? new Error("We could not finish setting up your profile. Please try again.");
}
async function loadVisibleSubmissions(currentUserId: string | null) {
  const supabase = requireSupabase();
  const { data: liveRows, error: liveError } = await supabase
    .from("submissions")
    .select("*")
    .eq("status", "live")
    .order("created_at", { ascending: false });

  if (liveError) {
    throw new Error(liveError.message);
  }

  let ownRows: SubmissionRow[] = [];

  if (currentUserId) {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    ownRows = (data ?? []) as SubmissionRow[];
  }

  return mergeUniqueById([...(liveRows ?? []) as SubmissionRow[], ...ownRows])
    .map(mapSubmission)
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
}

async function loadActiveQuestionSets(submissionIds: string[]) {
  if (submissionIds.length === 0) {
    return [];
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("question_set_versions")
    .select("*")
    .eq("is_active", true)
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSubmissionSchemaError(error.message)) {
      throw new Error(latestSubmissionSchemaMessage);
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as QuestionSetVersionRow[]).map(mapQuestionSetVersion);
}

async function loadResponses(currentUserId: string | null, ownedSubmissionIds: string[]) {
  if (!currentUserId) {
    return [];
  }

  const supabase = requireSupabase();
  const { data: authoredRows, error: authoredError } = await supabase
    .from("test_responses")
    .select("*")
    .eq("tester_user_id", currentUserId)
    .order("submitted_at", { ascending: false });

  if (authoredError) {
    throw new Error(authoredError.message);
  }

  let ownedRows: TestResponseRow[] = [];

  if (ownedSubmissionIds.length > 0) {
    const { data, error } = await supabase
      .from("test_responses")
      .select("*")
      .in("submission_id", ownedSubmissionIds)
      .order("submitted_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    ownedRows = (data ?? []) as TestResponseRow[];
  }

  return mergeUniqueById([...(authoredRows ?? []) as TestResponseRow[], ...ownedRows])
    .map(mapTestResponse)
    .sort(
      (first, second) =>
        new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime(),
    );
}

async function loadFeedbackRatings(currentUserId: string | null) {
  if (!currentUserId) {
    return [];
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("feedback_ratings")
    .select("*")
    .eq("rated_by_user_id", currentUserId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as FeedbackRatingRow[]).map(mapFeedbackRating);
}

async function loadCreditTransactions(currentUserId: string | null) {
  if (!currentUserId) {
    return [];
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CreditTransactionRow[]).map(mapCreditTransaction);
}

async function persistSubmission(draft: SubmissionDraft, questions: Question[]) {
  const { supabase } = await ensureAuthenticatedSession(
    "Please sign in again before publishing your app.",
  );
  const productTypes = normalizeProductTypes(draft.productTypes);
  const accessLinks = normalizeAccessLinks(
    productTypes.reduce<SubmissionDraft["accessLinks"]>((links, productType) => {
      const value = draft.accessLinks[productType];

      if (typeof value === "string") {
        links[productType] = value;
      }

      return links;
    }, {}),
  );
  const primaryAccessLink = getPrimaryAccessLink(accessLinks, productTypes);

  if (!primaryAccessLink) {
    throw new Error("Add at least one public link before creating the submission.");
  }

  const { data, error } = await supabase.rpc("create_submission_with_questions", {
    p_product_name: draft.productName,
    p_product_types: productTypes,
    p_description: draft.description,
    p_target_audience: draft.targetAudience,
    p_instructions: draft.instructions,
    p_access_links: accessLinks,
    p_question_mode: draft.questionMode,
    p_questions: questions,
    p_estimated_minutes: estimateMinutes(questions),
  });

  if (error) {
    if (isMissingSubmissionSchemaError(error.message)) {
      throw new Error(latestSubmissionSchemaMessage);
    }

    throw new Error(error.message);
  }

  if (typeof data !== "string") {
    throw new Error("The submission could not be created.");
  }

  return data;
}

async function persistSubmissionDetails(submissionId: string, draft: SubmissionDraft) {
  const { supabase } = await ensureAuthenticatedSession(
    "Please sign in again before updating your app.",
  );
  const productTypes = normalizeProductTypes(draft.productTypes);

  if (productTypes.length === 0) {
    throw new Error("Select at least one app type before saving.");
  }

  const accessLinks = normalizeAccessLinks(
    productTypes.reduce<SubmissionDraft["accessLinks"]>((links, productType) => {
      const value = draft.accessLinks[productType];

      if (typeof value === "string") {
        links[productType] = value;
      }

      return links;
    }, {}),
  );
  const primaryAccessLink = getPrimaryAccessLink(accessLinks, productTypes);

  if (!primaryAccessLink) {
    throw new Error("Add at least one public link before saving.");
  }

  const { error } = await supabase
    .from("submissions")
    .update({
      product_name: draft.productName.trim(),
      product_type: productTypes[0],
      product_types: productTypes,
      description: draft.description,
      target_audience: draft.targetAudience,
      instructions: draft.instructions,
      access_url: primaryAccessLink.url,
      access_links: accessLinks,
    })
    .eq("id", submissionId)
    .select("id")
    .single();

  if (error) {
    if (isMissingSubmissionSchemaError(error.message)) {
      throw new Error(latestSubmissionSchemaMessage);
    }

    throw new Error(error.message);
  }
}
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    ...emptyState,
    otpChallenge: getStoredOtpChallenge(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const loadIdRef = useRef(0);
  const otpRequestInFlightRef = useRef<Map<string, Promise<OTPChallenge>>>(new Map());
  const recentOtpRequestsRef = useRef<Map<string, { challenge: OTPChallenge; sentAt: number }>>(new Map());

  const refreshState = useCallback(async (authUserOverride?: SupabaseAuthUser | null) => {
    const loadId = ++loadIdRef.current;

    if (!hasSupabaseConfig) {
      setState({
        ...emptyState,
        otpChallenge: getStoredOtpChallenge(),
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const supabase = requireSupabase();
      const authUser =
        authUserOverride !== undefined
          ? authUserOverride
          : (await supabase.auth.getUser()).data.user;
      const currentUserId = authUser?.id ?? null;
      const currentProfile = authUser ? await ensureProfile(authUser) : null;

      if (currentProfile?.banStatus === "banned") {
        if (loadId !== loadIdRef.current) {
          return;
        }

        setState({
          currentUserId,
          users: [currentProfile],
          submissions: [],
          questionSetVersions: [],
          responses: [],
          feedbackRatings: [],
          creditTransactions: [],
          emailLogs: [],
          moderationActions: [],
          otpChallenge: getStoredOtpChallenge(),
        });
        return;
      }

      const submissions = await loadVisibleSubmissions(currentUserId);
      const questionSetVersions = await loadActiveQuestionSets(submissions.map((submission) => submission.id));
      const ownedSubmissionIds = currentUserId
        ? submissions
            .filter((submission) => submission.userId === currentUserId)
            .map((submission) => submission.id)
        : [];
      const responses = await loadResponses(currentUserId, ownedSubmissionIds);
      const feedbackRatings = await loadFeedbackRatings(currentUserId);
      const creditTransactions = await loadCreditTransactions(currentUserId);

      if (loadId !== loadIdRef.current) {
        return;
      }

      setState({
        currentUserId,
        users: currentProfile ? [currentProfile] : [],
        submissions,
        questionSetVersions,
        responses,
        feedbackRatings,
        creditTransactions,
        emailLogs: [],
        moderationActions: [],
        otpChallenge: getStoredOtpChallenge(),
      });
    } catch (error) {
      if (loadId !== loadIdRef.current) {
        return;
      }

      console.error(error);
      setState({
        ...emptyState,
        otpChallenge: getStoredOtpChallenge(),
      });
    } finally {
      if (loadId === loadIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshState();

    if (!hasSupabaseConfig) {
      return undefined;
    }

    const supabase = requireSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void refreshState(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshState]);

  const value = useMemo<AppStateContextValue>(() => {
    const currentUser = getCurrentUser(state);

    return {
      state,
      currentUser,
      isLoading,
      isConfigured: hasSupabaseConfig,
      async requestOtp(email, submissionId) {
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
          throw new Error("Add an email so we can send the one-time code.");
        }

        const requestKey = `${normalizedEmail}::${submissionId ?? ""}`;
        const now = Date.now();

        for (const [key, entry] of recentOtpRequestsRef.current.entries()) {
          if (now - entry.sentAt >= OTP_REQUEST_DEDUPE_WINDOW_MS) {
            recentOtpRequestsRef.current.delete(key);
          }
        }

        const recentRequest = recentOtpRequestsRef.current.get(requestKey);

        if (recentRequest && now - recentRequest.sentAt < OTP_REQUEST_DEDUPE_WINDOW_MS) {
          storeOtpChallenge(recentRequest.challenge);
          setState((current) => ({
            ...current,
            otpChallenge: recentRequest.challenge,
          }));
          return recentRequest.challenge;
        }

        const inFlightRequest = otpRequestInFlightRef.current.get(requestKey);

        if (inFlightRequest) {
          return inFlightRequest;
        }

        const sendPromise = (async () => {
          const supabase = requireSupabase();
          const { error } = await supabase.auth.signInWithOtp({
            email: normalizedEmail,
            options: {
              shouldCreateUser: true,
            },
          });

          if (error) {
            throw new Error(error.message);
          }

          const challenge = createOtpChallenge(normalizedEmail, submissionId);
          recentOtpRequestsRef.current.set(requestKey, {
            challenge,
            sentAt: Date.now(),
          });
          storeOtpChallenge(challenge);
          setState((current) => ({
            ...current,
            otpChallenge: challenge,
          }));

          return challenge;
        })();

        otpRequestInFlightRef.current.set(requestKey, sendPromise);

        try {
          return await sendPromise;
        } finally {
          otpRequestInFlightRef.current.delete(requestKey);
        }
      },      async verifyOtp(code) {
        const challenge = state.otpChallenge ?? getStoredOtpChallenge();

        if (!challenge) {
          return { ok: false, message: "Request a new code to continue." };
        }

        if (new Date(challenge.expiresAt).getTime() < Date.now()) {
          clearStoredOtpChallenge();
          setState((current) => ({
            ...current,
            otpChallenge: null,
          }));
          return { ok: false, message: "That code expired. Please request a new one." };
        }

        const supabase = requireSupabase();
        const { data, error } = await supabase.auth.verifyOtp({
          email: challenge.email,
          token: code.trim(),
          type: "email",
        });

        if (error) {
          return { ok: false, message: error.message };
        }

        if (data.session?.access_token && data.session.refresh_token) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          if (setSessionError) {
            clearStoredOtpChallenge();
            setState((current) => ({
              ...current,
              otpChallenge: null,
            }));
            return {
              ok: false,
              message:
                "We verified your email, but could not finish signing you in. Please request a new code and try again.",
            };
          }
        }

        let authUser: SupabaseAuthUser;

        try {
          const { session } = await ensureAuthenticatedSession(
            "We verified your email, but could not finish signing you in. Please request a new code and try again.",
          );
          authUser = session.user;
        } catch (sessionError) {
          clearStoredOtpChallenge();
          setState((current) => ({
            ...current,
            otpChallenge: null,
          }));
          return {
            ok: false,
            message:
              sessionError instanceof Error
                ? sessionError.message
                : "We verified your email, but could not finish signing you in. Please request a new code and try again.",
          };
        }

        const verifiedProfile = await ensureProfile(authUser);

        clearStoredOtpChallenge();
        setState((current) => ({
          ...current,
          otpChallenge: null,
        }));

        if (verifiedProfile.banStatus === "banned") {
          await refreshState(authUser);
          return {
            ok: true,
            message: "Email verified. You're ready to go.",
          };
        }

        let createdSubmissionId: string | null = null;

        if (challenge.submissionId) {
          const pendingSubmission = getPendingSubmission(challenge.submissionId);

          if (pendingSubmission) {
            createdSubmissionId = await persistSubmission(
              pendingSubmission.draft,
              pendingSubmission.questions,
            );
            clearPendingSubmission(challenge.submissionId);
          }
        }

        await refreshState();

        return {
          ok: true,
          message: "Email verified. You're ready to go.",
          submissionId: createdSubmissionId,
        };
      },
      async createSubmission(draft, questions) {
        if (!currentUser) {
          const pendingId = createPendingSubmissionId();
          savePendingSubmission({
            id: pendingId,
            draft,
            questions,
            createdAt: new Date().toISOString(),
          });
          return pendingId;
        }

        const createdId = await persistSubmission(draft, questions);
        await refreshState();
        return createdId;
      },
      async updateSubmissionDetails(submissionId, draft) {
        await persistSubmissionDetails(submissionId, draft);
        await refreshState();
      },
      async completeTest(submissionId, answers, durationSeconds) {
        if (!currentUser) {
          return { ok: false, message: "Verify your email before completing tests." };
        }

        const supabase = requireSupabase();
        const { data, error } = await supabase.rpc("submit_test_response", {
          p_submission_id: submissionId,
          p_answers: answers,
          p_duration_seconds: durationSeconds,
        });

        if (error) {
          return { ok: false, message: error.message };
        }

        const result = (data ?? {}) as SubmissionRpcResult;
        await refreshState();

        if (result.responseId) {
          void notifySubmissionOwnerAboutNewResult(result.responseId);
        }

        return {
          ok: Boolean(result.ok),
          message: result.message ?? "Test submitted.",
        };
      },
      async reviseTestResponse(responseId, answers, durationSeconds) {
        if (!currentUser) {
          return { ok: false, message: "Verify your email before revising feedback." };
        }

        const supabase = requireSupabase();
        const { data, error } = await supabase.rpc("revise_test_response", {
          p_response_id: responseId,
          p_answers: answers,
          p_duration_seconds: durationSeconds,
        });

        if (error) {
          return { ok: false, message: error.message };
        }

        const result = (data ?? {}) as SubmissionRpcResult;
        await refreshState();

        if (result.responseId) {
          void notifySubmissionOwnerAboutNewResult(result.responseId);
        }

        return {
          ok: Boolean(result.ok),
          message: result.message ?? "Feedback revised.",
        };
      },
      async rateFeedback(responseId, ratingValue) {
        if (!currentUser) {
          return;
        }

        const supabase = requireSupabase();
        const { error } = await supabase.from("feedback_ratings").upsert(
          {
            test_response_id: responseId,
            rated_by_user_id: currentUser.id,
            rating_value: ratingValue,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "test_response_id,rated_by_user_id",
          },
        );

        if (error) {
          throw new Error(error.message);
        }

        await refreshState();
      },
      async updateQuestionSet(submissionId, mode, questions) {
        const supabase = requireSupabase();
        const { error } = await supabase.rpc("update_question_set", {
          p_submission_id: submissionId,
          p_mode: mode,
          p_questions: questions,
          p_estimated_minutes: estimateMinutes(questions),
        });

        if (error) {
          throw new Error(error.message);
        }

        await refreshState();
      },
      async addModerationAction() {
        return;
      },
      async resetDemo() {
        return;
      },
      async changeEmail(nextEmail: string) {
        if (!currentUser) {
          return { ok: false, message: "Sign in to change your email." };
        }

        const normalizedEmail = nextEmail.trim().toLowerCase();

        if (!normalizedEmail) {
          return { ok: false, message: "Enter the new email you want to use." };
        }

        if (normalizedEmail === currentUser.email.toLowerCase()) {
          return { ok: false, message: "That is already your current email." };
        }

        const supabase = requireSupabase();
        const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/profile` : undefined;
        const { error } = await supabase.auth.updateUser(
          { email: normalizedEmail },
          { emailRedirectTo: redirectTo },
        );

        if (error) {
          return { ok: false, message: error.message };
        }

        return {
          ok: true,
          message:
            "Check your inboxes to confirm the new email address. Your sign-in email stays the same until you finish confirmation.",
        };
      },
      async updatePaymentMethods(paymentMethods: PaymentMethods) {
        if (!currentUser) {
          return { ok: false, message: "Sign in to save your payment methods." };
        }

        const normalizedPaymentMethods = normalizePaymentMethods(paymentMethods);
        const validationMessage = validatePaymentMethods(normalizedPaymentMethods);

        if (validationMessage) {
          return { ok: false, message: validationMessage };
        }

        let supabase: ReturnType<typeof requireSupabase>;

        try {
          ({ supabase } = await ensureAuthenticatedSession(
            "Please sign in again before saving your payment methods.",
          ));
        } catch (sessionError) {
          return {
            ok: false,
            message:
              sessionError instanceof Error
                ? sessionError.message
                : "Please sign in again before saving your payment methods.",
          };
        }

        const { error } = await supabase
          .from("profiles")
          .update({
            paypal_handle: normalizedPaymentMethods.paypalHandle,
            venmo_handle: normalizedPaymentMethods.venmoHandle,
            cash_app_handle: normalizedPaymentMethods.cashAppHandle,
          })
          .eq("id", currentUser.id)
          .select("id")
          .single();

        if (error) {
          if (isMissingProfilePaymentSchemaError(error.message)) {
            return { ok: false, message: latestProfilePaymentSchemaMessage };
          }

          return { ok: false, message: error.message };
        }

        await refreshState();

        const filledCount = Object.values(normalizedPaymentMethods).filter((value) => Boolean(value)).length;

        return {
          ok: true,
          message:
            filledCount > 0
              ? `Payment methods saved. ${filledCount} payout option${filledCount === 1 ? "" : "s"} ready on your profile.`
              : "Payment methods cleared from your profile.",
        };
      },
      async deleteAccount() {
        if (!currentUser) {
          return { ok: false, message: "Sign in to delete your account." };
        }

        const supabase = requireSupabase();
        const invokeDeleteAccount = async (accessToken: string) => {
          return supabase.functions.invoke<{
            ok?: boolean;
            message?: string;
            error?: string;
          }>("delete-account", {
            body: {},
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
        };

        let accessToken: string;

        try {
          const { session } = await ensureAuthenticatedSession(
            "We couldn't verify your account deletion request. Refresh the page and try again.",
          );
          accessToken = session.access_token;
        } catch (sessionError) {
          return {
            ok: false,
            message:
              sessionError instanceof Error
                ? sessionError.message
                : "We couldn't verify your account deletion request. Refresh the page and try again.",
          };
        }

        let result = await invokeDeleteAccount(accessToken);

        if (result.error && /invalid jwt/i.test(result.error.message ?? "")) {
          try {
            const { session } = await ensureAuthenticatedSession(
              "We couldn't verify your account deletion request. Refresh the page and try again.",
            );
            result = await invokeDeleteAccount(session.access_token);
          } catch {
            return {
              ok: false,
              message: "We couldn't verify your account deletion request. Refresh the page and try again.",
            };
          }
        }

        const { data, error } = result;

        if (error) {
          let message = error.message?.trim() || "We could not delete your account right now.";
          const response =
            typeof error === "object" && error && "context" in error && error.context instanceof Response
              ? error.context
              : null;

          if (response) {
            try {
              const payload = (await response.json()) as { error?: string; message?: string };
              message = payload.error ?? payload.message ?? message;
            } catch {
              // Keep the function error message when the response body is unavailable.
            }
          }

          if (/invalid jwt/i.test(message) || /unauthorized/i.test(message)) {
            message = "We couldn't verify your account deletion request. Refresh the page and try again.";
          }

          return {
            ok: false,
            message,
          };
        }

        clearStoredOtpChallenge();

        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore local sign-out errors after the user has already been deleted server-side.
        }

        setState({
          ...emptyState,
          otpChallenge: null,
        });

        return {
          ok: true,
          message: data?.message ?? "Your account and associated data have been deleted.",
        };
      },
      async signOut() {
        if (!hasSupabaseConfig) {
          return;
        }

        clearStoredOtpChallenge();
        const supabase = requireSupabase();
        await supabase.auth.signOut();
        await refreshState(null);
      },
    };
  }, [isLoading, refreshState, state]);

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}












