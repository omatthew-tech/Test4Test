import {
  EarnVisibilitySummary,
  ProductType,
  Question,
  QuestionMode,
  QuestionSetVersion,
  Submission,
} from "../types";
import { normalizeAccessLinks, normalizeProductTypes, productTypesBadges } from "./format";
import { requireSupabase } from "./supabase";

interface EarnVisibilitySummaryRpcRow {
  submission_id: string | null;
  product_name: string | null;
  has_completed_test: boolean | null;
  rank: number | null;
  ranked_submission_count: number | null;
  would_rank: number | null;
  would_ranked_submission_count: number | null;
  token_balance: number | null;
  test_back_rate_percent: number | null;
  satisfaction_rate_percent: number | null;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
  product_type?: ProductType | null;
  product_types?: ProductType[] | null;
  description: string | null;
  target_audience: string | null;
  instructions: string | null;
  google_play_closed_test_instructions?: string | null;
  access_links?: Submission["accessLinks"] | null;
  access_url?: string | null;
  access_method?: string | null;
  requires_recording?: boolean | null;
  needs_google_play_closed_testers?: boolean | null;
  public_share_slug?: string | null;
  public_share_message?: string | null;
  status: Submission["status"];
  question_mode: QuestionMode;
  is_open_for_more_tests: boolean;
  estimated_minutes: number;
  response_count: number | null;
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
  questions: unknown;
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCount(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeRank(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 1) {
    return null;
  }

  return Math.round(value);
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Question[];
  }

  return value.map((question, index) => {
    const current = question as Partial<Question>;

    return {
      id:
        typeof current.id === "string" && current.id.trim() ? current.id : `question-${index + 1}`,
      title: typeof current.title === "string" ? current.title : "Untitled question",
      type: current.type === "paragraph" ? "paragraph" : "multiple",
      required: current.required !== false,
      sortOrder: typeof current.sortOrder === "number" ? current.sortOrder : index + 1,
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
        : (Object.keys(accessLinks) as ProductType[]),
  );

  return {
    id: row.id,
    userId: row.user_id,
    productName: row.product_name,
    productTypes,
    description: row.description ?? "",
    targetAudience: row.target_audience ?? "",
    instructions: row.instructions ?? "",
    googlePlayClosedTestInstructions: row.google_play_closed_test_instructions ?? "",
    accessLinks,
    requiresRecording: row.requires_recording === true,
    needsGooglePlayClosedTesters: row.needs_google_play_closed_testers === true,
    publicShareSlug: row.public_share_slug ?? null,
    publicShareMessage: row.public_share_message ?? null,
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

function mapQuestionSetVersion(row: QuestionSetVersionRow): QuestionSetVersion {
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

export async function loadEarnVisibilitySummary() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_my_earn_visibility_summary");

  if (error) {
    throw new Error(error.message);
  }

  const row = ((data ?? []) as EarnVisibilitySummaryRpcRow[])[0];

  if (!row) {
    return {
      submissionId: null,
      productName: null,
      hasCompletedTest: false,
      rank: null,
      rankedSubmissionCount: 0,
      wouldRank: null,
      wouldRankedSubmissionCount: 0,
      testBackRatePercent: 100,
      satisfactionRatePercent: 100,
      tokenBalance: 0,
    } satisfies EarnVisibilitySummary;
  }

  return {
    submissionId: row.submission_id ?? null,
    productName: row.product_name ?? null,
    hasCompletedTest: row.has_completed_test === true,
    rank: normalizeRank(row.rank),
    rankedSubmissionCount: normalizeCount(row.ranked_submission_count),
    wouldRank: normalizeRank(row.would_rank),
    wouldRankedSubmissionCount: normalizeCount(row.would_ranked_submission_count),
    testBackRatePercent: normalizePercent(row.test_back_rate_percent),
    satisfactionRatePercent: normalizePercent(row.satisfaction_rate_percent),
    tokenBalance: normalizeCount(row.token_balance),
  } satisfies EarnVisibilitySummary;
}

export async function loadEarnVisibilitySubmission(submissionId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapSubmission(data as SubmissionRow) : null;
}

export async function loadEarnVisibilityQuestionSet(submissionId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("question_set_versions")
    .select("*")
    .eq("submission_id", submissionId)
    .order("version_number", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const questionSets = ((data ?? []) as QuestionSetVersionRow[]).map(mapQuestionSetVersion);

  return questionSets.find((questionSet) => questionSet.isActive) ?? questionSets[0] ?? null;
}
