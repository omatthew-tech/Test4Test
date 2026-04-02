import {
  GENERAL_DEFAULT_PARAGRAPH_TEMPLATE_IDS,
  GENERAL_DEFAULT_TEMPLATE_IDS,
  GENERAL_PARAGRAPH_QUESTION_BANK,
  GENERAL_QUESTION_BANK,
} from "../data/generalQuestionBank";
import { ProductType, Question, QuestionMode, SubmissionDraft } from "../types";
import { hasNativeProductTypes, normalizeAccessUrl } from "./format";

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

const GENERAL_MULTIPLE_QUESTION_COUNT = 3;
const GENERAL_PARAGRAPH_QUESTION_COUNT = 2;
const GENERAL_QUESTION_COUNT = GENERAL_MULTIPLE_QUESTION_COUNT + GENERAL_PARAGRAPH_QUESTION_COUNT;
const GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID = "q025";
const GENERAL_PLACEHOLDER_QUESTION_ID = "general-placeholder";
const GENERAL_STARTER_PARAGRAPH_QUESTION_ID = "general-starter-paragraph";
const GENERAL_PERSONALIZED_QUESTION_ID_PREFIX = "general-featured-";
const LEGACY_GENERAL_PERSONALIZED_QUESTION_ID = "general-company-clarity";
const generalQuestionTemplateById = new Map(
  GENERAL_QUESTION_BANK.map((template) => [template.id, template]),
);
const generalParagraphQuestionTemplateById = new Map(
  GENERAL_PARAGRAPH_QUESTION_BANK.map((template) => [template.id, template]),
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
    .replace(/this product(?:'s|\u2019s)/gi, `${name}'s`)
    .replace(/the product(?:'s|\u2019s)/gi, `${name}'s`)
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
function getTemplatesByIds<T>(templateById: Map<string, T>, ids: readonly string[]) {
  return ids
    .map((id) => templateById.get(id))
    .filter((template): template is T => Boolean(template));
}

function sampleTemplates<T extends { id: string }>(
  templates: readonly T[],
  count: number,
  excludedIds: readonly string[] = [],
) {
  const excluded = new Set(excludedIds);
  const pool = templates.filter((template) => !excluded.has(template.id));

  for (let index = 0; index < count && index < pool.length; index += 1) {
    const randomIndex = index + Math.floor(Math.random() * (pool.length - index));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }

  return pool.slice(0, count);
}

function resolveGeneralTemplate(templateId: string) {
  return generalQuestionTemplateById.get(templateId) ?? GENERAL_QUESTION_BANK[0];
}

function normalizeGeneralQuestionOptions(options: readonly string[]) {
  if (options.length <= 5) {
    return [...options];
  }

  return [
    options[0],
    options[1],
    options[Math.floor(options.length / 2)],
    options[options.length - 2],
    options[options.length - 1],
  ];
}

function buildGeneralPlaceholderQuestion() {
  return createQuestion(
    GENERAL_PLACEHOLDER_QUESTION_ID,
    "",
    "multiple",
    1,
    ["", ""],
  );
}

function buildPersonalizedGeneralQuestion(
  productName: string,
  template: (typeof GENERAL_QUESTION_BANK)[number],
  sortOrder = 2,
) {
  return createQuestion(
    `${GENERAL_PERSONALIZED_QUESTION_ID_PREFIX}${template.id}`,
    personalizeGeneralPrompt(template.prompt, productName),
    "multiple",
    sortOrder,
    normalizeGeneralQuestionOptions(template.options),
  );
}

function buildGeneralParagraphQuestion(
  template: (typeof GENERAL_PARAGRAPH_QUESTION_BANK)[number],
  sortOrder: number,
) {
  return createQuestion(
    `general-paragraph-${template.id}`,
    template.prompt,
    "paragraph",
    sortOrder,
  );
}

function buildGeneralQuestionsFromTemplates(
  productName: string,
  featuredTemplate: (typeof GENERAL_QUESTION_BANK)[number],
  multipleTemplates: readonly (typeof GENERAL_QUESTION_BANK)[number][],
  paragraphTemplates: readonly (typeof GENERAL_PARAGRAPH_QUESTION_BANK)[number][],
) {
  const fallbackMultipleTemplates =
    multipleTemplates.length >= GENERAL_MULTIPLE_QUESTION_COUNT - 2
      ? multipleTemplates
      : [
          ...multipleTemplates,
          ...sampleTemplates(
            GENERAL_QUESTION_BANK,
            GENERAL_MULTIPLE_QUESTION_COUNT - 2 - multipleTemplates.length,
            [featuredTemplate.id, ...multipleTemplates.map((template) => template.id)],
          ),
        ];
  const fallbackParagraphTemplates =
    paragraphTemplates.length >= GENERAL_PARAGRAPH_QUESTION_COUNT
      ? paragraphTemplates
      : [
          ...paragraphTemplates,
          ...sampleTemplates(
            GENERAL_PARAGRAPH_QUESTION_BANK,
            GENERAL_PARAGRAPH_QUESTION_COUNT - paragraphTemplates.length,
            paragraphTemplates.map((template) => template.id),
          ),
        ];

  return [
    buildGeneralPlaceholderQuestion(),
    buildPersonalizedGeneralQuestion(productName, featuredTemplate, 2),
    ...fallbackMultipleTemplates.slice(0, GENERAL_MULTIPLE_QUESTION_COUNT - 2).map((template, index) =>
      createQuestion(
        `general-${template.id}`,
        template.prompt,
        "multiple",
        index + 3,
        normalizeGeneralQuestionOptions(template.options),
      ),
    ),
    ...fallbackParagraphTemplates.slice(0, GENERAL_PARAGRAPH_QUESTION_COUNT).map((template, index) =>
      buildGeneralParagraphQuestion(template, GENERAL_MULTIPLE_QUESTION_COUNT + index + 1),
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

export function buildStarterGeneralQuestions(_productName: string) {
  return [
    buildGeneralPlaceholderQuestion(),
    createQuestion(
      GENERAL_STARTER_PARAGRAPH_QUESTION_ID,
      "",
      "paragraph",
      2,
    ),
  ];
}

export function buildGeneralQuestions(productName: string) {
  return buildGeneralQuestionsFromTemplates(
    productName,
    resolveGeneralTemplate(GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID),
    getTemplatesByIds(generalQuestionTemplateById, GENERAL_DEFAULT_TEMPLATE_IDS),
    getTemplatesByIds(
      generalParagraphQuestionTemplateById,
      GENERAL_DEFAULT_PARAGRAPH_TEMPLATE_IDS,
    ),
  );
}

export function buildRandomGeneralQuestions(productName: string) {
  const [featuredTemplate, ...remainingTemplates] = sampleTemplates(
    GENERAL_QUESTION_BANK,
    GENERAL_MULTIPLE_QUESTION_COUNT - 1,
  );

  return buildGeneralQuestionsFromTemplates(
    productName,
    featuredTemplate ?? resolveGeneralTemplate(GENERAL_DEFAULT_PERSONALIZED_TEMPLATE_ID),
    remainingTemplates,
    sampleTemplates(GENERAL_PARAGRAPH_QUESTION_BANK, GENERAL_PARAGRAPH_QUESTION_COUNT),
  );
}

export function syncGeneralQuestionsProductName(questions: Question[], productName: string) {
  if (questions.length === 0) {
    return buildStarterGeneralQuestions(productName);
  }

  const isStarterGeneralSet =
    questions.length === 2 &&
    questions[0]?.id === GENERAL_PLACEHOLDER_QUESTION_ID &&
    questions[0]?.type === "multiple" &&
    questions[1]?.id === GENERAL_STARTER_PARAGRAPH_QUESTION_ID &&
    questions[1]?.type === "paragraph";

  if (isStarterGeneralSet) {
    return questions.map((question, index) => ({
      ...question,
      sortOrder: index + 1,
      options: question.type === "multiple" && question.options ? [...question.options] : undefined,
    }));
  }

  const isGeneralSet =
    questions.length === GENERAL_QUESTION_COUNT &&
    questions.slice(0, GENERAL_MULTIPLE_QUESTION_COUNT).every((question) => question.type === "multiple") &&
    questions.slice(GENERAL_MULTIPLE_QUESTION_COUNT).every((question) => question.type === "paragraph") &&
    questions[0]?.id === GENERAL_PLACEHOLDER_QUESTION_ID &&
    (questions[1]?.id.startsWith(GENERAL_PERSONALIZED_QUESTION_ID_PREFIX) ||
      questions[1]?.id === LEGACY_GENERAL_PERSONALIZED_QUESTION_ID);

  if (!isGeneralSet) {
    return questions.map((question, index) => ({
      ...question,
      sortOrder: index + 1,
      options: question.type === "multiple" && question.options ? [...question.options] : undefined,
    }));
  }

  return [
    {
      ...questions[0],
      sortOrder: 1,
      options: questions[0].type === "multiple" && questions[0].options ? [...questions[0].options] : undefined,
    },
    buildPersonalizedGeneralQuestion(
      productName,
      getFeaturedGeneralTemplateFromQuestion(questions[1]),
      2,
    ),
    ...questions.slice(2).map((question, index) => ({
      ...question,
      sortOrder: index + 3,
      options: question.type === "multiple" && question.options ? [...question.options] : undefined,
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

  return hasNativeProductTypes(draft.productTypes)
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

export function validateAccessLink(url: string, productType: ProductType) {
  const rawValue = url.trim();

  if (!rawValue) {
    return {
      valid: false,
      message: "Add a public link testers can open.",
    };
  }

  const normalizedUrl = normalizeAccessUrl(rawValue);

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    const disallowedHosts = ["localhost", "127.0.0.1"];

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        message: "Use a live public domain or http/https URL so testers can access it.",
      };
    }

    if (!hostname.includes(".")) {
      return {
        valid: false,
        message: "Enter a public domain like test4test.io or a full public URL.",
      };
    }

    if (disallowedHosts.includes(hostname) || hostname.endsWith(".local")) {
      return {
        valid: false,
        message: "Private or local-only links cannot go live in the MVP.",
      };
    }

    if (normalizedUrl.toLowerCase().includes("private")) {
      return {
        valid: false,
        message: "This link looks private. Please provide a public tester-accessible link.",
      };
    }

    if (
      productType !== "website" &&
      !/(appstore|play\.google|testflight|figma|framer|notion|webflow|vercel|netlify|github)/i.test(normalizedUrl)
    ) {
      return {
        valid: true,
        message: "Public store, beta, and demo links are allowed as long as they are easy to access.",
      };
    }

    return {
      valid: true,
      message:
        rawValue === normalizedUrl
          ? "Link looks public and usable for launch."
          : `Looks good. We'll open this as ${normalizedUrl}.`,
    };
  } catch {
    return {
      valid: false,
      message: "Enter a public domain like test4test.io or a full public URL.",
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
      "",
      "paragraph",
      2,
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
      return "Custom";
  }
}

export function questionTypeLabel(mode: QuestionMode) {
  switch (mode) {
    case "ai":
      return "AI-generated questions";
    case "custom":
      return "Custom questions";
    default:
      return "Custom questions";
  }
}
