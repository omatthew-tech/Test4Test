import { GENERAL_QUESTION_BANK } from "../data/generalQuestionBank";
import { Question, QuestionMode, ProductType, SubmissionDraft } from "../types";
import { isNativeAppType } from "./format";

const easeScale = [
  "Very hard",
  "A little hard",
  "Easy enough",
  "Very easy",
];

const clarityScale = [
  "Very unclear",
  "Unclear",
  "Neither clear nor unclear",
  "Clear",
  "Very clear",
];

const trustScale = [
  "Not at all",
  "A little",
  "Mostly",
  "Very",
];

const GENERAL_QUESTION_COUNT = 5;
const GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID = "q025";
const GENERAL_DEFAULT_TEMPLATE_IDS = ["q033", "q080", "q089", "q064"] as const;
const GENERAL_PERSONALIZED_QUESTION_ID_PREFIX = "general-featured-";
const LEGACY_GENERAL_PERSONALIZED_QUESTION_ID = "general-company-clarity";
const generalQuestionTemplateById = new Map(
  GENERAL_QUESTION_BANK.map((template) => [template.id, template]),
);

function createQuestion(
  id: string,
  title: string,
  type: Question["type"],
  sortOrder: number,
  options?: string[],
): Question {
  return {
    id,
    title,
    type,
    required: true,
    sortOrder,
    options,
  };
}

function normalizeProductName(productName: string) {
  const trimmed = productName.trim();
  return trimmed || "Your product";
}

function personalizeGeneralPrompt(prompt: string, productName: string) {
  const name = normalizeProductName(productName);
  const normalizedPrompt = prompt
    .replace(/this product[�']s/gi, `${name}'s`)
    .replace(/the product[�']s/gi, `${name}'s`)
    .replace(/this product/gi, name)
    .replace(/the product/gi, name);

  if (normalizedPrompt.toLowerCase().includes(name.toLowerCase())) {
    return normalizedPrompt;
  }

  if (normalizedPrompt.endsWith("?")) {
    return `${normalizedPrompt.slice(0, -1)} in ${name}?`;
  }

  return `${normalizedPrompt} in ${name}`;
}

function getGeneralTemplatesByIds(ids: readonly string[]) {
  return ids
    .map((id) => generalQuestionTemplateById.get(id))
    .filter((template): template is (typeof GENERAL_QUESTION_BANK)[number] => Boolean(template));
}

function sampleGeneralTemplates(count: number, excludedIds: readonly string[] = []) {
  const excluded = new Set(excludedIds);
  const pool = GENERAL_QUESTION_BANK.filter((template) => !excluded.has(template.id));

  for (let index = 0; index < count; index += 1) {
    const randomIndex = index + Math.floor(Math.random() * (pool.length - index));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }

  return pool.slice(0, count);
}

function resolveGeneralTemplate(templateId: string) {
  return generalQuestionTemplateById.get(templateId) ?? GENERAL_QUESTION_BANK[0];
}

function buildPersonalizedGeneralQuestion(
  productName: string,
  template: (typeof GENERAL_QUESTION_BANK)[number],
) {
  return createQuestion(
    `${GENERAL_PERSONALIZED_QUESTION_ID_PREFIX}${template.id}`,
    personalizeGeneralPrompt(template.prompt, productName),
    "multiple",
    1,
    [...template.options],
  );
}

function buildGeneralQuestionsFromTemplates(
  productName: string,
  featuredTemplate: (typeof GENERAL_QUESTION_BANK)[number],
  templates: readonly (typeof GENERAL_QUESTION_BANK)[number][],
) {
  const fallbackTemplates =
    templates.length >= GENERAL_QUESTION_COUNT - 1
      ? templates
      : [
          ...templates,
          ...sampleGeneralTemplates(
            GENERAL_QUESTION_COUNT - 1 - templates.length,
            [featuredTemplate.id, ...templates.map((template) => template.id)],
          ),
        ];

  return [
    buildPersonalizedGeneralQuestion(productName, featuredTemplate),
    ...fallbackTemplates.slice(0, GENERAL_QUESTION_COUNT - 1).map((template, index) =>
      createQuestion(
        `general-${template.id}`,
        template.prompt,
        "multiple",
        index + 2,
        [...template.options],
      ),
    ),
  ];
}

function getFeaturedGeneralTemplateFromQuestion(question: Question | undefined) {
  if (!question) {
    return resolveGeneralTemplate(GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID);
  }

  if (question.id.startsWith(GENERAL_PERSONALIZED_QUESTION_ID_PREFIX)) {
    return resolveGeneralTemplate(
      question.id.slice(GENERAL_PERSONALIZED_QUESTION_ID_PREFIX.length),
    );
  }

  if (question.id === LEGACY_GENERAL_PERSONALIZED_QUESTION_ID) {
    return resolveGeneralTemplate(GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID);
  }

  return resolveGeneralTemplate(GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID);
}

export function buildGeneralQuestions(productName: string) {
  return buildGeneralQuestionsFromTemplates(
    productName,
    resolveGeneralTemplate(GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID),
    getGeneralTemplatesByIds(GENERAL_DEFAULT_TEMPLATE_IDS),
  );
}

export function buildRandomGeneralQuestions(productName: string) {
  const [featuredTemplate, ...remainingTemplates] = sampleGeneralTemplates(GENERAL_QUESTION_COUNT);

  return buildGeneralQuestionsFromTemplates(
    productName,
    featuredTemplate,
    remainingTemplates,
  );
}

export function syncGeneralQuestionsProductName(questions: Question[], productName: string) {
  const isGeneralSet =
    questions.length === GENERAL_QUESTION_COUNT &&
    questions.every((question) => question.type === "multiple") &&
    (questions[0]?.id.startsWith(GENERAL_PERSONALIZED_QUESTION_ID_PREFIX) ||
      questions[0]?.id === LEGACY_GENERAL_PERSONALIZED_QUESTION_ID);

  if (!isGeneralSet) {
    return buildGeneralQuestions(productName);
  }

  return [
    buildPersonalizedGeneralQuestion(
      productName,
      getFeaturedGeneralTemplateFromQuestion(questions[0]),
    ),
    ...questions.slice(1).map((question, index) => ({
      ...question,
      sortOrder: index + 2,
      options: question.options ? [...question.options] : undefined,
    })),
  ];
}

function inferPrimaryTask(draft: SubmissionDraft) {
  const source = `${draft.productName} ${draft.description} ${draft.targetAudience}`.toLowerCase();

  if (source.includes("budget") || source.includes("finance")) {
    return "manage money";
  }

  if (source.includes("travel") || source.includes("trip")) {
    return "plan a trip";
  }

  if (source.includes("meal") || source.includes("recipe") || source.includes("food")) {
    return "find the right meal";
  }

  if (source.includes("habit") || source.includes("wellness")) {
    return "build a routine";
  }

  if (source.includes("design") || source.includes("creative")) {
    return "move through the workflow";
  }

  return isNativeAppType(draft.productType)
    ? "use the main mobile flow"
    : "use the main flow";
}

export function buildAiQuestions(draft: SubmissionDraft) {
  const primaryTask = inferPrimaryTask(draft);
  const productName = draft.productName;

  return [
    createQuestion(
      `${productName}-ai-1`,
      `How clear was ${productName} on first look?`,
      "multiple",
      1,
      [...clarityScale],
    ),
    createQuestion(
      `${productName}-ai-2`,
      `How easy was it to ${primaryTask}?`,
      "multiple",
      2,
      [...easeScale],
    ),
    createQuestion(
      `${productName}-ai-3`,
      "How trustworthy did it feel?",
      "multiple",
      3,
      [...trustScale],
    ),
    createQuestion(
      `${productName}-ai-4`,
      "Where did you hesitate or slow down?",
      "paragraph",
      4,
    ),
    createQuestion(
      `${productName}-ai-5`,
      "What would make it easier right away?",
      "paragraph",
      5,
    ),
  ];
}

export function estimateMinutes(questions: Question[]) {
  const paragraphCount = questions.filter((question) => question.type === "paragraph").length;
  const multipleCount = questions.length - paragraphCount;
  return Math.max(3, Math.round(paragraphCount * 1.2 + multipleCount * 0.35 + 1));
}

export function validateAccessUrl(url: string, productType: ProductType) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const disallowedHosts = ["localhost", "127.0.0.1"];

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        message: "Use a live http or https link so testers can access it.",
      };
    }

    if (disallowedHosts.includes(hostname) || hostname.endsWith(".local")) {
      return {
        valid: false,
        message: "Private or local-only links cannot go live in the MVP.",
      };
    }

    if (url.toLowerCase().includes("private")) {
      return {
        valid: false,
        message: "This link looks private. Please provide a public tester-accessible link.",
      };
    }

    if (
      isNativeAppType(productType) &&
      !/(appstore|play\.google|testflight|figma|framer|notion|webflow|vercel|netlify|github)/i.test(url)
    ) {
      return {
        valid: true,
        message: "Public store, beta, and demo links are allowed as long as they are easy to access.",
      };
    }

    return {
      valid: true,
      message: "Link looks public and usable for launch.",
    };
  } catch {
    return {
      valid: false,
      message: "Enter a valid public URL to publish the submission.",
    };
  }
}

export function defaultCustomQuestions(productName: string) {
  return [
    createQuestion(
      `${productName}-custom-1`,
      "",
      "multiple",
      1,
      ["", ""],
    ),
    createQuestion(
      `${productName}-custom-2`,
      "How easy is the main action to find?",
      "multiple",
      2,
      [...easeScale],
    ),
    createQuestion(
      `${productName}-custom-3`,
      "How easy are the labels and buttons to understand?",
      "multiple",
      3,
      [...clarityScale],
    ),
    createQuestion(
      `${productName}-custom-4`,
      "What worked well?",
      "paragraph",
      4,
    ),
    createQuestion(
      `${productName}-custom-5`,
      "What should change first?",
      "paragraph",
      5,
    ),
  ];
}

export function getQuestionsForMode(
  draft: SubmissionDraft,
  mode: QuestionMode,
  customQuestions?: Question[],
) {
  if (mode === "general") {
    return buildGeneralQuestions(draft.productName);
  }

  if (mode === "ai") {
    return buildAiQuestions(draft);
  }

  return customQuestions && customQuestions.length > 0
    ? customQuestions
    : defaultCustomQuestions(draft.productName);
}

export function questionModeLabel(mode: QuestionMode) {
  switch (mode) {
    case "ai":
      return "AI-generated";
    case "custom":
      return "Custom";
    default:
      return "General";
  }
}

export function questionTypeLabel(mode: QuestionMode) {
  switch (mode) {
    case "ai":
      return "AI-generated questions";
    case "custom":
      return "Custom questions";
    default:
      return "General questions";
  }
}
