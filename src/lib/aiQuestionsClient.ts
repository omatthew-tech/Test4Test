import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { Question, SubmissionDraft } from "../types";
import { getOrderedAccessLinks, normalizeAccessUrl, normalizeProductTypes } from "./format";
import { buildAiQuestions } from "./questions";
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

interface AccessLinkPayload {
  productType: string;
  url: string;
}

interface AiFunctionRequestPayload {
  productName: string;
  productTypes: string[];
  productType: string;
  accessLinks: AccessLinkPayload[];
  accessUrl: string;
  description: string;
  instructions: string;
}

export interface AiQuestionGenerationResult {
  questions: Question[];
  source: "edge" | "fallback";
  notice?: string;
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

function buildAccessLinkPayload(draft: SubmissionDraft): AccessLinkPayload[] {
  return getOrderedAccessLinks(draft.accessLinks, draft.productTypes).map((link) => ({
    productType: link.productType,
    url: normalizeAccessUrl(link.url),
  }));
}

// Keep sending the old single-link fields so older deployed edge functions still work.
function buildAiFunctionRequestPayload(draft: SubmissionDraft): AiFunctionRequestPayload {
  const productTypes = normalizeProductTypes(draft.productTypes);
  const accessLinks = buildAccessLinkPayload(draft);
  const primaryAccessLink = accessLinks[0];

  return {
    productName: draft.productName,
    productTypes,
    productType: primaryAccessLink?.productType ?? productTypes[0] ?? "website",
    accessLinks,
    accessUrl: primaryAccessLink?.url ?? "",
    description: draft.description,
    instructions: draft.instructions,
  };
}

function buildFallbackQuestions(draft: SubmissionDraft, notice: string): AiQuestionGenerationResult {
  const fallbackQuestions = buildAiQuestions({
    ...draft,
    productName: normalizeText(draft.productName) || "Your product",
  });

  return {
    questions: cloneQuestions(fallbackQuestions),
    source: "fallback",
    notice,
  };
}

async function readFunctionErrorMessage(response?: Response) {
  if (!response) {
    return "";
  }

  try {
    const contentType = (response.headers.get("Content-Type") ?? "").split(";")[0].trim();

    if (contentType === "application/json") {
      const payload = (await response.clone().json()) as { error?: unknown; message?: unknown };

      if (typeof payload.error === "string" && payload.error.trim()) {
        return normalizeText(payload.error);
      }

      if (typeof payload.message === "string" && payload.message.trim()) {
        return normalizeText(payload.message);
      }
    }

    const text = await response.clone().text();
    return text.trim() ? normalizeText(text) : "";
  } catch {
    return "";
  }
}

function shouldUseFallback(error: unknown, status?: number) {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return true;
  }

  return error instanceof FunctionsHttpError && [401, 403, 404, 500, 502, 503, 504].includes(status ?? 0);
}

function buildFallbackNotice(status?: number) {
  if (status === 401 || status === 403) {
    return "We couldn't reach the live AI question service, so we created a smart fallback question set instead.";
  }

  if (status === 404) {
    return "The live AI question service isn't available right now, so we created a smart fallback question set instead.";
  }

  return "The live AI question service is unavailable right now, so we created a smart fallback question set instead.";
}

function buildUserFacingError(error: unknown, status?: number, responseMessage?: string) {
  if (status === 400 && responseMessage) {
    return responseMessage;
  }

  if (responseMessage && status && status < 500) {
    return responseMessage;
  }

  if (error instanceof FunctionsFetchError) {
    return "We couldn't reach the AI question service. Check your connection and try again.";
  }

  if (error instanceof FunctionsRelayError) {
    return "The AI question service is temporarily unavailable. Please try again in a moment.";
  }

  if (error instanceof FunctionsHttpError && status) {
    if (status === 401 || status === 403) {
      return "The AI question service is still protected and can't be called before login yet.";
    }

    if (status === 404) {
      return "The AI question service isn't deployed in the connected Supabase project yet.";
    }
  }

  return responseMessage || (error instanceof Error ? error.message : "AI question generation failed. Please try again.");
}

export function buildAiQuestionDraftKey(draft: SubmissionDraft) {
  return JSON.stringify({
    productName: normalizeText(draft.productName),
    productTypes: normalizeProductTypes(draft.productTypes),
    description: normalizeText(draft.description),
    instructions: normalizeText(draft.instructions),
    accessLinks: buildAccessLinkPayload(draft),
  });
}

export async function generateAiQuestions(
  draft: SubmissionDraft,
): Promise<AiQuestionGenerationResult> {
  if (!hasSupabaseConfig) {
    return buildFallbackQuestions(
      draft,
      "AI question generation isn't configured in this environment, so we created a smart fallback question set instead.",
    );
  }

  const cacheKey = buildAiQuestionDraftKey(draft);
  const cached = aiQuestionCache.get(cacheKey);

  if (cached) {
    return {
      questions: cloneQuestions(cached),
      source: "edge",
    };
  }

  const supabase = requireSupabase();
  const { data, error, response } = await supabase.functions.invoke<AiQuestionResponse>(AI_FUNCTION_NAME, {
    body: buildAiFunctionRequestPayload(draft),
  });

  if (error) {
    const status = response?.status;
    const responseMessage = await readFunctionErrorMessage(response);

    if (shouldUseFallback(error, status)) {
      console.warn("[generate-ai-questions] Falling back to local question generation.", {
        status,
        responseMessage,
        errorName: error.name,
      });

      return buildFallbackQuestions(draft, buildFallbackNotice(status));
    }

    throw new Error(buildUserFacingError(error, status, responseMessage));
  }

  if (!data?.questions || !Array.isArray(data.questions)) {
    throw new Error(data?.error || "AI question generation returned an unexpected response.");
  }

  const normalized = normalizeGeneratedQuestions(data.questions);
  aiQuestionCache.set(cacheKey, normalized);

  return {
    questions: cloneQuestions(normalized),
    source: "edge",
  };
}