import { hasSupabaseConfig, requireSupabase } from "./supabase";

const DRAFT_STORAGE_PREFIX = "test4test:test-response-draft";
const DRAFT_TTL_DAYS = 30;

export type TestResponseDraftSource = "server" | "local";
export type TestResponseDraftPersistedTo = "server" | "local";

export interface TestResponseDraft {
  userId: string;
  submissionId: string;
  submissionVersionId: string;
  questionSetVersionId: string;
  answerValues: Record<string, string>;
  startedAt: string;
  updatedAt: string;
  source: TestResponseDraftSource;
}

export interface SaveTestResponseDraftInput {
  userId: string;
  submissionId: string;
  submissionVersionId: string;
  questionSetVersionId: string;
  answerValues: Record<string, string>;
  startedAt: string;
}

interface TestResponseDraftRow {
  tester_user_id: string;
  submission_id: string;
  submission_version_id: string;
  question_set_version_id: string;
  answer_values: unknown;
  started_at: string;
  updated_at: string;
}

interface StoredTestResponseDraft {
  userId?: unknown;
  submissionId?: unknown;
  submissionVersionId?: unknown;
  questionSetVersionId?: unknown;
  answerValues?: unknown;
  startedAt?: unknown;
  updatedAt?: unknown;
}

function buildDraftStorageKey(userId: string, submissionId: string, questionSetVersionId: string) {
  return `${DRAFT_STORAGE_PREFIX}:${userId}:${submissionId}:${questionSetVersionId}`;
}

function buildDraftStoragePrefix(userId: string, submissionId: string) {
  return `${DRAFT_STORAGE_PREFIX}:${userId}:${submissionId}:`;
}

function normalizeAnswerValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([questionId, answer]) => typeof questionId === "string" && typeof answer === "string")
      .map(([questionId, answer]) => [questionId, answer]),
  );
}

function normalizeStartedAt(value: unknown) {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function normalizeUpdatedAt(value: unknown) {
  if (typeof value !== "string") {
    return new Date(0).toISOString();
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? new Date(0).toISOString() : new Date(timestamp).toISOString();
}

function mapDraftRow(row: TestResponseDraftRow): TestResponseDraft {
  return {
    userId: row.tester_user_id,
    submissionId: row.submission_id,
    submissionVersionId: row.submission_version_id,
    questionSetVersionId: row.question_set_version_id,
    answerValues: normalizeAnswerValues(row.answer_values),
    startedAt: normalizeStartedAt(row.started_at),
    updatedAt: normalizeUpdatedAt(row.updated_at),
    source: "server",
  };
}

function mapStoredDraft(stored: StoredTestResponseDraft): TestResponseDraft | null {
  if (
    typeof stored.userId !== "string" ||
    typeof stored.submissionId !== "string" ||
    typeof stored.submissionVersionId !== "string" ||
    typeof stored.questionSetVersionId !== "string"
  ) {
    return null;
  }

  return {
    userId: stored.userId,
    submissionId: stored.submissionId,
    submissionVersionId: stored.submissionVersionId,
    questionSetVersionId: stored.questionSetVersionId,
    answerValues: normalizeAnswerValues(stored.answerValues),
    startedAt: normalizeStartedAt(stored.startedAt),
    updatedAt: normalizeUpdatedAt(stored.updatedAt),
    source: "local",
  };
}

function getDraftExpiry() {
  return new Date(Date.now() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function getNewestDraft(first: TestResponseDraft | null, second: TestResponseDraft | null) {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return Date.parse(second.updatedAt) > Date.parse(first.updatedAt) ? second : first;
}

export function loadLocalTestResponseDraft(
  userId: string,
  submissionId: string,
  questionSetVersionId: string,
) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(
      buildDraftStorageKey(userId, submissionId, questionSetVersionId),
    );

    if (!stored) {
      return null;
    }

    return mapStoredDraft(JSON.parse(stored) as StoredTestResponseDraft);
  } catch {
    return null;
  }
}

export function saveLocalTestResponseDraft(input: SaveTestResponseDraftInput) {
  if (typeof window === "undefined") {
    return;
  }

  const updatedAt = new Date().toISOString();
  const payload: StoredTestResponseDraft = {
    userId: input.userId,
    submissionId: input.submissionId,
    submissionVersionId: input.submissionVersionId,
    questionSetVersionId: input.questionSetVersionId,
    answerValues: input.answerValues,
    startedAt: input.startedAt,
    updatedAt,
  };

  try {
    window.localStorage.setItem(
      buildDraftStorageKey(input.userId, input.submissionId, input.questionSetVersionId),
      JSON.stringify(payload),
    );
  } catch {
    // Local draft persistence is a best-effort safety net.
  }
}

export function clearLocalTestResponseDraft(
  userId: string,
  submissionId: string,
  questionSetVersionId?: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (questionSetVersionId) {
      window.localStorage.removeItem(buildDraftStorageKey(userId, submissionId, questionSetVersionId));
      return;
    }

    const prefix = buildDraftStoragePrefix(userId, submissionId);

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage cleanup errors.
  }
}

export async function loadTestResponseDraft(
  userId: string,
  submissionId: string,
  questionSetVersionId: string,
) {
  const localDraft = loadLocalTestResponseDraft(userId, submissionId, questionSetVersionId);

  if (!hasSupabaseConfig) {
    return localDraft;
  }

  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("test_response_drafts")
      .select("*")
      .eq("submission_id", submissionId)
      .eq("tester_user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const serverDraft =
      data && (data as TestResponseDraftRow).question_set_version_id === questionSetVersionId
        ? mapDraftRow(data as TestResponseDraftRow)
        : null;

    return getNewestDraft(serverDraft, localDraft);
  } catch {
    return localDraft;
  }
}

export async function saveTestResponseDraft(
  input: SaveTestResponseDraftInput,
  options?: { skipServer?: boolean },
) {
  saveLocalTestResponseDraft(input);

  if (options?.skipServer || !hasSupabaseConfig) {
    return { persistedTo: "local" satisfies TestResponseDraftPersistedTo };
  }

  try {
    const now = new Date().toISOString();
    const supabase = requireSupabase();
    const { error } = await supabase
      .from("test_response_drafts")
      .upsert(
        {
          tester_user_id: input.userId,
          submission_id: input.submissionId,
          submission_version_id: input.submissionVersionId,
          question_set_version_id: input.questionSetVersionId,
          answer_values: input.answerValues,
          started_at: input.startedAt,
          updated_at: now,
          expires_at: getDraftExpiry(),
        },
        { onConflict: "submission_id,tester_user_id" },
      );

    if (error) {
      throw new Error(error.message);
    }

    return { persistedTo: "server" satisfies TestResponseDraftPersistedTo };
  } catch {
    return { persistedTo: "local" satisfies TestResponseDraftPersistedTo };
  }
}

export async function clearTestResponseDraft(
  userId: string,
  submissionId: string,
  questionSetVersionId?: string,
) {
  clearLocalTestResponseDraft(userId, submissionId, questionSetVersionId);

  if (!hasSupabaseConfig) {
    return;
  }

  try {
    const supabase = requireSupabase();
    let query = supabase
      .from("test_response_drafts")
      .delete()
      .eq("submission_id", submissionId)
      .eq("tester_user_id", userId);

    if (questionSetVersionId) {
      query = query.eq("question_set_version_id", questionSetVersionId);
    }

    await query;
  } catch {
    // Draft cleanup is also handled by submit_test_response after migration.
  }
}
