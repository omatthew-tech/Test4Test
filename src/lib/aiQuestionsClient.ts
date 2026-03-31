import { Question, SubmissionDraft } from "../types";
import { displayAccessUrl, normalizeAccessUrl, normalizeProductTypes } from "./format";
import { hasSupabaseConfig, requireSupabase } from "./supabase";

const AI_FUNCTION_NAME = "generate-ai-questions";
const AI_QUESTION_COUNT = 5;

interface GeneratedAiQuestionPayload {
  title: string;
  type: Question["type"];
  options?: string[];
}

interface AiQuestionResponse {
  questions: GeneratedAiQuestionPayload[];
  cached?: boolean;
  error?: string;
}

const aiQuestionCache = new Map<string, Question[]>();

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cloneQuestions(questions: Question[]) {
  return questions.map((question) => ({
    ...question,
    options: question.options ? [...question.options] : undefined,
  }));
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeGeneratedQuestions(payload: GeneratedAiQuestionPayload[]) {
  const normalized = payload
    .map((question, index) => {
      const title = normalizeText(question.title ?? "");
      const type = question.type === "paragraph" ? "paragraph" : "multiple";
      const options = Array.isArray(question.options)
        ? question.options.map((option) => normalizeText(option)).filter(Boolean)
        : [];

      return {
        id: `ai-generated-${index + 1}-${slugify(title || `question-${index + 1}`)}`,
        title,
        type,
        required: true,
        sortOrder: index + 1,
        options: type === "multiple" ? options : undefined,
      } satisfies Question;
    })
    .filter((question) => question.title);

  if (normalized.length !== AI_QUESTION_COUNT) {
    throw new Error("AI generation returned the wrong number of questions.");
  }

  const multipleChoiceCount = normalized.filter((question) => question.type === "multiple").length;
  const paragraphCount = normalized.filter((question) => question.type === "paragraph").length;

  if (multipleChoiceCount < 3 || paragraphCount < 2) {
    throw new Error("AI generation returned an incomplete question mix.");
  }

  if (
    normalized.some(
      (question) =>
        question.type === "multiple" &&
        ((question.options?.length ?? 0) < 5 || (question.options?.length ?? 0) > 7),
    )
  ) {
    throw new Error("AI generation returned invalid answer choices.");
  }

  return normalized;
}

export function buildAiQuestionDraftKey(draft: SubmissionDraft) {
  return JSON.stringify({
    productName: normalizeText(draft.productName),
    productTypes: normalizeProductTypes(draft.productTypes),
    description: normalizeText(draft.description),
    instructions: normalizeText(draft.instructions),
    accessUrl: normalizeText(displayAccessUrl(draft.accessUrl)),
  });
}

export async function generateAiQuestions(draft: SubmissionDraft) {
  if (!hasSupabaseConfig) {
    throw new Error(
      "Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before generating AI questions.",
    );
  }

  const cacheKey = buildAiQuestionDraftKey(draft);
  const cached = aiQuestionCache.get(cacheKey);

  if (cached) {
    return cloneQuestions(cached);
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke<AiQuestionResponse>(AI_FUNCTION_NAME, {
    body: {
      productName: draft.productName,
      productTypes: normalizeProductTypes(draft.productTypes),
      description: draft.description,
      instructions: draft.instructions,
      accessUrl: normalizeAccessUrl(draft.accessUrl),
    },
  });

  if (error) {
    throw new Error(error.message || "AI question generation failed. Please try again.");
  }

  if (!data?.questions || !Array.isArray(data.questions)) {
    throw new Error(data?.error || "AI question generation returned an unexpected response.");
  }

  const normalized = normalizeGeneratedQuestions(data.questions);
  aiQuestionCache.set(cacheKey, normalized);
  return cloneQuestions(normalized);
}
