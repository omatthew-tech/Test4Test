const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_QUESTION_COUNT = 5;
const PRODUCT_TYPE_ORDER = ["website", "ios", "android"] as const;

type ProductType = (typeof PRODUCT_TYPE_ORDER)[number];

interface GenerateQuestionRequest {
  productName?: string;
  productTypes?: string[];
  description?: string;
  instructions?: string;
  accessUrl?: string;
}

interface GeneratedQuestionPayload {
  title: string;
  type: "multiple" | "paragraph";
  options?: string[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeProductTypes(value: unknown) {
  if (!Array.isArray(value)) {
    return ["website"] satisfies ProductType[];
  }

  const requested = new Set(
    value
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter(Boolean),
  );

  const normalized = PRODUCT_TYPE_ORDER.filter((type) => requested.has(type));
  return normalized.length > 0 ? normalized : ["website"];
}

function buildPrompt(payload: GenerateQuestionRequest) {
  const productName = normalizeText(payload.productName) || "This product";
  const productTypes = normalizeProductTypes(payload.productTypes);
  const description = normalizeText(payload.description) || "No description provided.";
  const instructions = normalizeText(payload.instructions) || "No tester instructions provided.";
  const accessUrl = normalizeText(payload.accessUrl) || "No public URL provided.";

  return [
    `Product name: ${productName}`,
    `Product types: ${productTypes.join(", ")}`,
    `Public link: ${accessUrl}`,
    `Short description: ${description}`,
    `Tester instructions: ${instructions}`,
    "",
    "Generate exactly 5 usability-testing questions tailored to this app.",
    "",
    "Requirements:",
    "- Return exactly 5 questions.",
    "- Questions 1, 2, and 3 must be multiple-choice questions.",
    "- Questions 4 and 5 must be paragraph questions.",
    "- Every multiple-choice question must include 5 to 7 concise answer choices.",
    "- Keep the wording simple, direct, and easy for testers to answer quickly.",
    "- Use the product name in at least one question when it feels natural.",
    "- Focus on clarity, ease of use, navigation, trust, usefulness, or completing the main task.",
    "- Do not repeat the same question in different words.",
    "- Paragraph questions should invite specific, actionable feedback.",
    "- Do not mention that AI wrote the questions.",
    "",
    "Return JSON only.",
  ].join("\n");
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        parts.push(contentItem.text);
      }
    }
  }

  return parts.join("\n");
}

function normalizeQuestions(payload: { questions?: GeneratedQuestionPayload[] }) {
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error("AI question generation returned an unexpected shape.");
  }

  const normalized = payload.questions
    .map((question, index) => {
      const title = normalizeText(question?.title);
      const type = question?.type === "paragraph" ? "paragraph" : "multiple";
      const options = Array.isArray(question?.options)
        ? question.options.map((option) => normalizeText(option)).filter(Boolean)
        : [];

      return {
        id: `ai-generated-${index + 1}`,
        title,
        type,
        required: true,
        sortOrder: index + 1,
        options: type === "multiple" ? options.slice(0, 7) : undefined,
      };
    })
    .filter((question) => question.title);

  const multipleQuestions = normalized.filter((question) => question.type === "multiple");
  const paragraphQuestions = normalized.filter((question) => question.type === "paragraph");

  if (normalized.length !== AI_QUESTION_COUNT || multipleQuestions.length < 3 || paragraphQuestions.length < 2) {
    throw new Error("AI question generation returned an incomplete question set.");
  }

  if (multipleQuestions.some((question) => (question.options?.length ?? 0) < 5 || (question.options?.length ?? 0) > 7)) {
    throw new Error("AI question generation returned invalid answer choices.");
  }

  return [...multipleQuestions.slice(0, 3), ...paragraphQuestions.slice(0, 2)];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const openAiApiKey = Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";
  const openAiModel = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-5-mini";

  if (!openAiApiKey) {
    return json({ error: "Missing OPENAI_API_KEY in Supabase function secrets." }, 500);
  }

  try {
    const payload = (await request.json()) as GenerateQuestionRequest;
    const productName = normalizeText(payload.productName);
    const accessUrl = normalizeText(payload.accessUrl);

    if (!productName || !accessUrl) {
      return json({ error: "Add your app name and public app link before generating AI questions." }, 400);
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions:
          "You are a senior UX researcher writing concise usability-testing questions for startup products. Return only valid JSON that matches the requested schema.",
        input: buildPrompt(payload),
        max_output_tokens: 1400,
        text: {
          format: {
            type: "json_schema",
            name: "test4test_ai_questions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                questions: {
                  type: "array",
                  minItems: 5,
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      type: { type: "string", enum: ["multiple", "paragraph"] },
                      options: {
                        type: "array",
                        items: { type: "string" },
                        minItems: 0,
                        maxItems: 7,
                      },
                    },
                    required: ["title", "type", "options"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        },
      }),
    });

    const openAiPayload = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const message = typeof openAiPayload?.error?.message === "string"
        ? openAiPayload.error.message
        : "OpenAI request failed.";
      return json({ error: message }, openAiResponse.status);
    }

    const responseText = extractOutputText(openAiPayload);

    if (!responseText) {
      throw new Error("OpenAI returned an empty response.");
    }

    const parsed = JSON.parse(responseText) as { questions?: GeneratedQuestionPayload[] };
    const questions = normalizeQuestions(parsed);

    return json({ questions, cached: false });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "AI question generation failed. Please try again.",
      },
      500,
    );
  }
});
