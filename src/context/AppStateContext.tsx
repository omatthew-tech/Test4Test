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
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { productTypeBadge } from "../lib/format";
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
import { getCurrentUser } from "../lib/selectors";
import { hasSupabaseConfig, requireSupabase } from "../lib/supabase";
import {
  AppState,
  CreditTransaction,
  FeedbackRatingValue,
  ModerationAction,
  OTPChallenge,
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
  created_at: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
  product_type: Submission["productType"];
  description: string;
  target_audience: string;
  instructions: string;
  access_url: string;
  access_method: string;
  status: Submission["status"];
  question_mode: Submission["questionMode"];
  is_open_for_more_tests: boolean;
  estimated_minutes: number;
  response_count: number;
  last_response_at: string | null;
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
  completeTest: (
    submissionId: string,
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
  signOut: () => Promise<void>;
}

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
    banStatus: "clear",
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
  return {
    id: row.id,
    userId: row.user_id,
    productName: row.product_name,
    productType: row.product_type,
    description: row.description ?? "",
    targetAudience: row.target_audience ?? "",
    instructions: row.instructions ?? "",
    accessUrl: row.access_url,
    accessMethod: row.access_method ?? "",
    status: row.status,
    questionMode: row.question_mode,
    isOpenForMoreTests: row.is_open_for_more_tests,
    createdAt: row.created_at,
    estimatedMinutes: row.estimated_minutes,
    responseCount: row.response_count ?? 0,
    lastResponseAt: row.last_response_at,
    tags: [productTypeBadge(row.product_type)],
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

async function ensureProfile(authUser: SupabaseAuthUser) {
  const supabase = requireSupabase();
  const email = authUser.email ?? "";
  const displayName = resolveDisplayName(email, authUser);

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email,
        display_name: displayName,
      },
      { onConflict: "id" },
    )
    .select("id, email, display_name, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfile(data as ProfileRow);
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
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("create_submission_with_questions", {
    p_product_name: draft.productName,
    p_product_type: draft.productType,
    p_description: draft.description,
    p_target_audience: draft.targetAudience,
    p_instructions: draft.instructions,
    p_access_url: draft.accessUrl,
    p_access_method: draft.accessMethod,
    p_question_mode: draft.questionMode,
    p_questions: questions,
    p_estimated_minutes: estimateMinutes(questions),
  });

  if (error) {
    throw new Error(error.message);
  }

  if (typeof data !== "string") {
    throw new Error("The submission could not be created.");
  }

  return data;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    ...emptyState,
    otpChallenge: getStoredOtpChallenge(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const loadIdRef = useRef(0);

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
        storeOtpChallenge(challenge);
        setState((current) => ({
          ...current,
          otpChallenge: challenge,
        }));

        return challenge;
      },
      async verifyOtp(code) {
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

        const authUser = data.user ?? (await supabase.auth.getUser()).data.user;

        if (authUser) {
          await ensureProfile(authUser);
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

        clearStoredOtpChallenge();
        setState((current) => ({
          ...current,
          otpChallenge: null,
        }));
        await refreshState(authUser ?? null);

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

        await refreshState();

        const result = (data ?? {}) as SubmissionRpcResult;
        return {
          ok: Boolean(result.ok),
          message: result.message ?? "Test submitted.",
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
