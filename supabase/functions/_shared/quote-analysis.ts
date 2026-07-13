import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const quoteAnalysisPromptVersion = "quote-analysis-v4";

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const MAX_QUOTE_ANALYSIS_OUTPUT_TOKENS = 32000;
const MAX_FINDINGS = 8;
const MAX_POSITIVE_FEEDBACK_ITEMS = 5;
const MAX_UNCLEAR_FEEDBACK_ITEMS = 10;
const MAX_EVIDENCE_ITEMS = 4;

interface ReportRow {
  id: string;
  submission_id: string;
  owner_user_id: string;
  submissions?: { product_name?: string | null } | Array<{ product_name?: string | null }> | null;
}

interface QuoteRow {
  id: string;
  test_response_id: string;
  frame_id: string | null;
  timestamp_ms: number;
  start_ms: number | null;
  end_ms: number | null;
  quote_text: string;
  include_in_summary: boolean;
  test_responses?: { anonymous_label?: string | null } | Array<{ anonymous_label?: string | null }> | null;
}

interface FrameRow {
  id: string;
  test_response_id: string;
  frame_index: number;
  timestamp_ms: number;
  test_responses?: { anonymous_label?: string | null } | Array<{ anonymous_label?: string | null }> | null;
}

interface QuoteAnalysisRow {
  id: string;
  report_id: string;
  status: QuoteAnalysisStatus;
  model: string;
  prompt_version: string;
  input_hash: string;
  quote_count: number;
  analysis_json: QuoteAnalysisResult | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export interface QuoteAnalysisEvidence {
  quoteId: string;
  testResponseId: string;
  testerLabel: string;
  timestampMs: number;
  linkedFrameId: string | null;
  quote: string;
}

export interface QuoteAnalysisFinding {
  title: string;
  category:
    | "navigation"
    | "visual_design"
    | "content"
    | "functionality"
    | "performance"
    | "accessibility"
    | "data_clarity"
    | "other";
  severity: "low" | "medium" | "high";
  frequency: "one_off" | "repeated";
  quoteCount: number;
  recordingCount: number;
  description: string;
  evidence: QuoteAnalysisEvidence[];
  affectedArea: string;
  recommendation: string;
}

export interface QuoteAnalysisPositiveFeedback {
  summary: string;
  quoteCount: number;
  recordingCount: number;
  evidence: QuoteAnalysisEvidence[];
}

export interface QuoteAnalysisUnclearFeedback {
  quoteId: string;
  testResponseId: string;
  testerLabel: string;
  timestampMs: number;
  linkedFrameId: string | null;
  quote: string;
  reason: string;
}

export interface QuoteAnalysisPageInsight {
  frameId: string;
  usefulForUsabilityTesting: boolean;
  suggestion: string | null;
}

export interface QuoteAnalysisResult {
  summary: string;
  pageInsights: QuoteAnalysisPageInsight[];
  findings: QuoteAnalysisFinding[];
  positiveFeedback: QuoteAnalysisPositiveFeedback[];
  unclearFeedback: QuoteAnalysisUnclearFeedback[];
}

export interface PersistedQuoteAnalysis {
  id: string;
  reportId: string;
  status: QuoteAnalysisStatus;
  model: string;
  promptVersion: string;
  inputHash: string;
  quoteCount: number;
  analysis: QuoteAnalysisResult | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AnalysisQuoteInput {
  quoteId: string;
  testResponseId: string;
  testerLabel: string;
  timestampMs: number;
  startMs: number | null;
  endMs: number | null;
  linkedFrameId: string | null;
  text: string;
}

interface AnalysisPageInput {
  frameId: string;
  testResponseId: string;
  testerLabel: string;
  quotes: AnalysisQuoteInput[];
}

interface ReportQuoteAnalysisInput {
  reportId: string;
  appName: string;
  quotes: AnalysisQuoteInput[];
  pages: AnalysisPageInput[];
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getSubmissionProductName(report: ReportRow) {
  const submission = Array.isArray(report.submissions)
    ? report.submissions[0]
    : report.submissions;

  return normalizeText(submission?.product_name) || "Untitled app";
}

function getTesterLabel(row: Pick<QuoteRow | FrameRow, "test_responses">) {
  const response = Array.isArray(row.test_responses)
    ? row.test_responses[0]
    : row.test_responses;

  return normalizeText(response?.anonymous_label) || "Tester";
}

function getOpenAiModel() {
  return Deno.env.get("OPENAI_MODEL")?.trim() || DEFAULT_OPENAI_MODEL;
}

function getOpenAiApiKey() {
  return Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";
}

function mapAnalysisRow(row: QuoteAnalysisRow): PersistedQuoteAnalysis {
  return {
    id: row.id,
    reportId: row.report_id,
    status: row.status,
    model: row.model,
    promptVersion: row.prompt_version,
    inputHash: row.input_hash,
    quoteCount: row.quote_count,
    analysis: row.analysis_json,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadExistingAnalysis(admin: SupabaseClient, reportId: string) {
  const { data, error } = await admin
    .from("usability_report_quote_analyses")
    .select("*")
    .eq("report_id", reportId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapAnalysisRow(data as QuoteAnalysisRow) : null;
}

async function loadAnalysisInput(admin: SupabaseClient, reportId: string): Promise<ReportQuoteAnalysisInput> {
  const { data: reportData, error: reportError } = await admin
    .from("usability_reports")
    .select(`
      id,
      submission_id,
      owner_user_id,
      submissions (
        product_name
      )
    `)
    .eq("id", reportId)
    .single();

  if (reportError || !reportData) {
    throw new Error(reportError?.message ?? "Report not found.");
  }

  const report = reportData as ReportRow;
  const [frameResult, quoteResult] = await Promise.all([
    admin
      .from("usability_report_frames")
      .select(`
        id,
        test_response_id,
        frame_index,
        timestamp_ms,
        test_responses (
          anonymous_label
        )
      `)
      .eq("report_id", reportId)
      .order("test_response_id", { ascending: true })
      .order("frame_index", { ascending: true }),
    admin
      .from("usability_report_quotes")
      .select(`
        id,
        test_response_id,
        frame_id,
        timestamp_ms,
        start_ms,
        end_ms,
        quote_text,
        include_in_summary,
        test_responses (
          anonymous_label
        )
      `)
      .eq("report_id", reportId)
      .eq("include_in_summary", true)
      .order("test_response_id", { ascending: true })
      .order("timestamp_ms", { ascending: true }),
  ]);

  const { data: frameRows, error: frameError } = frameResult;
  if (frameError) {
    throw new Error(frameError.message);
  }

  const { data: quoteRows, error: quoteError } = quoteResult;

  if (quoteError) {
    throw new Error(quoteError.message);
  }

  const quotes = ((quoteRows ?? []) as QuoteRow[])
    .map((quote) => ({
      quoteId: quote.id,
      testResponseId: quote.test_response_id,
      testerLabel: getTesterLabel(quote),
      timestampMs: quote.timestamp_ms,
      startMs: quote.start_ms,
      endMs: quote.end_ms,
      linkedFrameId: quote.frame_id,
      text: normalizeText(quote.quote_text),
    }))
    .filter((quote) => quote.text);

  const quotesByResponse = new Map<string, AnalysisQuoteInput[]>();
  for (const quote of quotes) {
    const responseQuotes = quotesByResponse.get(quote.testResponseId);
    if (responseQuotes) {
      responseQuotes.push(quote);
    } else {
      quotesByResponse.set(quote.testResponseId, [quote]);
    }
  }

  const framesByResponse = new Map<string, FrameRow[]>();
  for (const frame of (frameRows ?? []) as FrameRow[]) {
    const responseFrames = framesByResponse.get(frame.test_response_id);
    if (responseFrames) {
      responseFrames.push(frame);
    } else {
      framesByResponse.set(frame.test_response_id, [frame]);
    }
  }

  const pages: AnalysisPageInput[] = [];
  for (const responseFrames of framesByResponse.values()) {
    responseFrames.sort((first, second) =>
      first.timestamp_ms - second.timestamp_ms || first.frame_index - second.frame_index
    );
    const responseQuotes = quotesByResponse.get(responseFrames[0]?.test_response_id ?? "") ?? [];

    for (let index = 0; index < responseFrames.length; index += 1) {
      const frame = responseFrames[index]!;
      const nextFrame = responseFrames[index + 1];
      const frameStartMs = frame.timestamp_ms;
      const frameEndMs = nextFrame?.timestamp_ms ?? Number.POSITIVE_INFINITY;
      const pageQuotes = responseQuotes
        .filter((quote) => {
          if (quote.linkedFrameId === frame.id) {
            return true;
          }

          const quoteStartMs = quote.startMs ?? quote.timestampMs;
          const quoteEndMs = Math.max(quoteStartMs + 1, quote.endMs ?? quote.timestampMs + 1);
          return Math.min(quoteEndMs, frameEndMs) > Math.max(quoteStartMs, frameStartMs);
        })
        .map((quote) => ({ ...quote, linkedFrameId: frame.id }));

      pages.push({
        frameId: frame.id,
        testResponseId: frame.test_response_id,
        testerLabel: getTesterLabel(frame),
        quotes: pageQuotes,
      });
    }
  }

  return {
    reportId,
    appName: getSubmissionProductName(report),
    quotes,
    pages,
  };
}

async function hashInput(input: ReportQuoteAnalysisInput) {
  const body = JSON.stringify({
    promptVersion: quoteAnalysisPromptVersion,
    appName: input.appName,
    quotes: input.quotes,
    pages: input.pages,
  });
  const encoded = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildQuoteAnalysisPrompt(input: ReportQuoteAnalysisInput) {
  const linkedQuoteIds = new Set(input.pages.flatMap((page) => page.quotes.map((quote) => quote.quoteId)));
  const unlinkedQuotes = input.quotes.filter((quote) => !linkedQuoteIds.has(quote.quoteId));

  return [
    "You are analyzing usability testing transcript quotes for a software product.",
    "",
    "Your job is to extract usability-relevant feedback, turn it into structured report findings, and decide which individual screenshot pages contain actionable usability-testing insight.",
    "",
    "The input may contain casual speech, filler words, incomplete thoughts, and narration. Ignore filler unless it supports a usability finding.",
    "",
    "Analyze the report as a whole for aggregate findings. For pageInsights, analyze every PAGE independently and evaluate all quotes in that PAGE together. The PAGE frameId identifies the screenshot where those quotes occurred, but the screenshot itself is not included.",
    "",
    "Rules:",
    "- Do not invent issues that are not supported by the quotes.",
    "- Use direct quote evidence when possible.",
    "- Evidence entries must reference quoteId values from the provided input.",
    "- Group similar comments into the same finding when they describe the same underlying usability issue.",
    "- If a comment is unclear, put it in unclearFeedback instead of guessing.",
    "- Keep findings concise and useful for a product team.",
    "- Return valid JSON only.",
    "- Do not include markdown.",
    "- Do not include explanations outside of the JSON.",
    "- Do not include filler quotes unless they support a usability finding.",
    `- Return no more than ${MAX_FINDINGS} findings, ${MAX_POSITIVE_FEEDBACK_ITEMS} positiveFeedback items, and ${MAX_UNCLEAR_FEEDBACK_ITEMS} unclearFeedback items.`,
    `- For each finding or positiveFeedback item, include no more than ${MAX_EVIDENCE_ITEMS} strongest evidence entries. Use quoteCount and recordingCount for the full support counts.`,
    "- Return exactly one pageInsights entry for every PAGE frameId in the input, in the same order.",
    "- Pages with no quotes must return usefulForUsabilityTesting false and suggestion null.",
    "- Mark usefulForUsabilityTesting true when that page's quotes reveal a concrete problem, confusion, friction, unmet expectation, or high-value improvement opportunity.",
    "- Treat qualified or mixed feedback as actionable when it contains a specific concern. For example, a page described as easy but also as having too much going on should receive a suggestion addressing the clutter concern.",
    "- Set suggestion to null whenever usefulForUsabilityTesting is false.",
    "- When usefulForUsabilityTesting is true, suggestion must be exactly one concise, actionable sentence describing what the product owner should improve on that page.",
    "- Ground page suggestions only in the quotes for that PAGE; do not infer unseen visual details.",
    "- Positive-only, descriptive, filler, or genuinely ambiguous page comments should return false and null, but do not discard a clear criticism merely because it is surrounded by positive language or casual speech.",
    "",
    "Frequency rules:",
    "- Use repeated only when the same issue is supported by quotes from more than one recording/testResponseId.",
    "- Use one_off when the issue appears in only one recording/testResponseId.",
    "- If one tester mentions the same issue multiple times, count the supporting quotes, but still mark frequency as one_off unless another tester or recording also supports it.",
    "",
    "Severity rules:",
    "- Use high when the issue blocks task completion, causes major confusion, or prevents the user from using a feature.",
    "- Use medium when the issue slows the user down, creates confusion, or makes an important feature harder to use.",
    "- Use low when the issue is minor, cosmetic, wording-related, or a small improvement suggestion.",
    "",
    "Category rules:",
    "- navigation: wayfinding, menus, scrolling, search, filters, or moving through the product.",
    "- visual_design: layout, visual clutter, unclear graphics, color, spacing, or visual hierarchy.",
    "- content: wording, labels, unclear terminology, or missing explanations.",
    "- functionality: broken, missing, or non-working features.",
    "- performance: loading, lag, speed, or responsiveness.",
    "- accessibility: readability, contrast, keyboard access, screen reader concerns, or accessibility barriers.",
    "- data_clarity: charts, metrics, analytics, calculations, legends, or confusing data displays.",
    "- other: none of the above fit.",
    "",
    `Product/app name: ${input.appName}`,
    "",
    "Pages to analyze:",
    JSON.stringify(input.pages, null, 2),
    "",
    "Quotes that could not be linked to a screenshot page (include these only in aggregate findings):",
    JSON.stringify(unlinkedQuotes, null, 2),
  ].join("\n");
}

const quoteEvidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    quoteId: { type: "string" },
    testResponseId: { type: "string" },
    testerLabel: { type: "string" },
    timestampMs: { type: "integer" },
    linkedFrameId: { type: ["string", "null"] },
    quote: { type: "string" },
  },
  required: ["quoteId", "testResponseId", "testerLabel", "timestampMs", "linkedFrameId", "quote"],
} as const;

const quoteAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    pageInsights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          frameId: { type: "string" },
          usefulForUsabilityTesting: { type: "boolean" },
          suggestion: { type: ["string", "null"] },
        },
        required: ["frameId", "usefulForUsabilityTesting", "suggestion"],
      },
    },
    findings: {
      type: "array",
      maxItems: MAX_FINDINGS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          category: {
            type: "string",
            enum: [
              "navigation",
              "visual_design",
              "content",
              "functionality",
              "performance",
              "accessibility",
              "data_clarity",
              "other",
            ],
          },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          frequency: { type: "string", enum: ["one_off", "repeated"] },
          quoteCount: { type: "integer" },
          recordingCount: { type: "integer" },
          description: { type: "string" },
          evidence: {
            type: "array",
            maxItems: MAX_EVIDENCE_ITEMS,
            items: quoteEvidenceSchema,
          },
          affectedArea: { type: "string" },
          recommendation: { type: "string" },
        },
        required: [
          "title",
          "category",
          "severity",
          "frequency",
          "quoteCount",
          "recordingCount",
          "description",
          "evidence",
          "affectedArea",
          "recommendation",
        ],
      },
    },
    positiveFeedback: {
      type: "array",
      maxItems: MAX_POSITIVE_FEEDBACK_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          quoteCount: { type: "integer" },
          recordingCount: { type: "integer" },
          evidence: {
            type: "array",
            maxItems: MAX_EVIDENCE_ITEMS,
            items: quoteEvidenceSchema,
          },
        },
        required: ["summary", "quoteCount", "recordingCount", "evidence"],
      },
    },
    unclearFeedback: {
      type: "array",
      maxItems: MAX_UNCLEAR_FEEDBACK_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quoteId: { type: "string" },
          testResponseId: { type: "string" },
          testerLabel: { type: "string" },
          timestampMs: { type: "integer" },
          linkedFrameId: { type: ["string", "null"] },
          quote: { type: "string" },
          reason: { type: "string" },
        },
        required: ["quoteId", "testResponseId", "testerLabel", "timestampMs", "linkedFrameId", "quote", "reason"],
      },
    },
  },
  required: ["summary", "pageInsights", "findings", "positiveFeedback", "unclearFeedback"],
} as const;

function extractOutputText(payload: unknown) {
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of response.output) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (typeof contentItem.text === "string" && contentItem.text.trim()) {
        parts.push(contentItem.text);
      }
    }
  }

  return parts.join("\n");
}

function getOpenAiIncompleteReason(payload: unknown) {
  const response = payload as {
    status?: unknown;
    incomplete_details?: { reason?: unknown } | null;
  };

  if (response.status !== "incomplete") {
    return "";
  }

  return typeof response.incomplete_details?.reason === "string"
    ? response.incomplete_details.reason
    : "unknown";
}

function normalizeEvidence(value: unknown): QuoteAnalysisEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const candidate = entry as Partial<QuoteAnalysisEvidence>;
      return {
        quoteId: normalizeText(candidate.quoteId),
        testResponseId: normalizeText(candidate.testResponseId),
        testerLabel: normalizeText(candidate.testerLabel) || "Tester",
        timestampMs: Number.isFinite(candidate.timestampMs) ? Math.max(0, Math.round(candidate.timestampMs ?? 0)) : 0,
        linkedFrameId: normalizeText(candidate.linkedFrameId) || null,
        quote: normalizeText(candidate.quote),
      };
    })
    .filter((entry) => entry.quoteId && entry.testResponseId && entry.quote);
}

function normalizeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeCategory(value: unknown): QuoteAnalysisFinding["category"] {
  switch (value) {
    case "navigation":
    case "visual_design":
    case "content":
    case "functionality":
    case "performance":
    case "accessibility":
    case "data_clarity":
    case "other":
      return value;
    default:
      return "other";
  }
}

function normalizeSeverity(value: unknown): QuoteAnalysisFinding["severity"] {
  switch (value) {
    case "high":
    case "medium":
    case "low":
      return value;
    default:
      return "low";
  }
}

function normalizeFrequency(value: unknown): QuoteAnalysisFinding["frequency"] {
  return value === "repeated" ? "repeated" : "one_off";
}

function normalizeSuggestion(value: unknown) {
  const suggestion = normalizeText(value);

  if (!suggestion) {
    return null;
  }

  const firstSentence = suggestion.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? suggestion;
  return /[.!?]$/.test(firstSentence) ? firstSentence : `${firstSentence}.`;
}

function normalizePageInsights(value: unknown, pages: AnalysisPageInput[]): QuoteAnalysisPageInsight[] {
  const candidates = Array.isArray(value) ? value : [];
  const byFrameId = new Map<string, Partial<QuoteAnalysisPageInsight>>();

  for (const entry of candidates) {
    const candidate = entry as Partial<QuoteAnalysisPageInsight>;
    const frameId = normalizeText(candidate.frameId);
    if (frameId && !byFrameId.has(frameId)) {
      byFrameId.set(frameId, candidate);
    }
  }

  return pages.map((page) => {
    const candidate = byFrameId.get(page.frameId);
    const suggestion = normalizeSuggestion(candidate?.suggestion);
    // The suggestion is the canonical signal. This avoids silently discarding useful
    // text when the model returns an internally inconsistent boolean alongside it.
    const usefulForUsabilityTesting = Boolean(suggestion);

    return {
      frameId: page.frameId,
      usefulForUsabilityTesting,
      suggestion: usefulForUsabilityTesting ? suggestion : null,
    };
  });
}

function normalizeAnalysisPayload(value: unknown, input: ReportQuoteAnalysisInput): QuoteAnalysisResult {
  const payload = value as Partial<QuoteAnalysisResult>;
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const positiveFeedback = Array.isArray(payload.positiveFeedback) ? payload.positiveFeedback : [];
  const unclearFeedback = Array.isArray(payload.unclearFeedback) ? payload.unclearFeedback : [];

  return {
    summary: normalizeText(payload.summary),
    pageInsights: normalizePageInsights(payload.pageInsights, input.pages),
    findings: findings.map((finding) => ({
      title: normalizeText(finding.title),
      category: normalizeCategory(finding.category),
      severity: normalizeSeverity(finding.severity),
      frequency: normalizeFrequency(finding.frequency),
      quoteCount: normalizeCount(finding.quoteCount),
      recordingCount: normalizeCount(finding.recordingCount),
      description: normalizeText(finding.description),
      evidence: normalizeEvidence(finding.evidence),
      affectedArea: normalizeText(finding.affectedArea) || "unknown",
      recommendation: normalizeText(finding.recommendation),
    })).filter((finding) => finding.title && finding.description),
    positiveFeedback: positiveFeedback.map((item) => ({
      summary: normalizeText(item.summary),
      quoteCount: normalizeCount(item.quoteCount),
      recordingCount: normalizeCount(item.recordingCount),
      evidence: normalizeEvidence(item.evidence),
    })).filter((item) => item.summary),
    unclearFeedback: unclearFeedback.map((item) => {
      const candidate = item as Partial<QuoteAnalysisUnclearFeedback>;
      return {
        quoteId: normalizeText(candidate.quoteId),
        testResponseId: normalizeText(candidate.testResponseId),
        testerLabel: normalizeText(candidate.testerLabel) || "Tester",
        timestampMs: Number.isFinite(candidate.timestampMs) ? Math.max(0, Math.round(candidate.timestampMs ?? 0)) : 0,
        linkedFrameId: normalizeText(candidate.linkedFrameId) || null,
        quote: normalizeText(candidate.quote),
        reason: normalizeText(candidate.reason),
      };
    }).filter((item) => item.quoteId && item.quote && item.reason),
  };
}

async function callOpenAiForQuoteAnalysis(input: ReportQuoteAnalysisInput, model: string) {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in Supabase function secrets.");
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are a senior UX researcher analyzing usability-test transcript quotes. Return only valid JSON matching the provided schema.",
      input: buildQuoteAnalysisPrompt(input),
      reasoning: {
        effort: "low",
      },
      max_output_tokens: MAX_QUOTE_ANALYSIS_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "test4test_quote_analysis",
          strict: true,
          schema: quoteAnalysisSchema,
        },
      },
    }),
  });
  const openAiPayload = await openAiResponse.json().catch(() => null);

  if (!openAiResponse.ok) {
    const message = typeof openAiPayload?.error?.message === "string"
      ? openAiPayload.error.message
      : "OpenAI quote analysis request failed.";
    throw new Error(message);
  }

  const responseText = extractOutputText(openAiPayload);
  const incompleteReason = getOpenAiIncompleteReason(openAiPayload);

  if (incompleteReason) {
    throw new Error(`OpenAI returned an incomplete quote analysis response: ${incompleteReason}.`);
  }

  if (!responseText) {
    throw new Error("OpenAI returned an empty quote analysis response.");
  }

  try {
    return normalizeAnalysisPayload(JSON.parse(responseText), input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON parse failed.";
    throw new Error(`OpenAI returned invalid quote analysis JSON: ${message}`);
  }
}

async function upsertAnalysis(
  admin: SupabaseClient,
  params: {
    reportId: string;
    status: QuoteAnalysisStatus;
    model: string;
    inputHash: string;
    quoteCount: number;
    analysis: QuoteAnalysisResult | null;
    errorMessage: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  },
) {
  const { data, error } = await admin
    .from("usability_report_quote_analyses")
    .upsert(
      {
        report_id: params.reportId,
        status: params.status,
        model: params.model,
        prompt_version: quoteAnalysisPromptVersion,
        input_hash: params.inputHash,
        quote_count: params.quoteCount,
        analysis_json: params.analysis,
        error_message: params.errorMessage,
        started_at: params.startedAt ?? null,
        completed_at: params.completedAt ?? null,
      },
      { onConflict: "report_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Quote analysis could not be saved.");
  }

  return mapAnalysisRow(data as QuoteAnalysisRow);
}

export async function loadReportQuoteAnalysis(admin: SupabaseClient, reportId: string) {
  return loadExistingAnalysis(admin, reportId);
}

export async function analyzeReportQuotes(
  admin: SupabaseClient,
  reportId: string,
  options: { force?: boolean } = {},
) {
  const model = getOpenAiModel();
  const analysisInput = await loadAnalysisInput(admin, reportId);
  const inputHash = await hashInput(analysisInput);
  const existing = await loadExistingAnalysis(admin, reportId);

  if (!options.force && existing?.status === "completed" && existing.inputHash === inputHash) {
    return existing;
  }

  const startedAt = new Date().toISOString();

  await upsertAnalysis(admin, {
    reportId,
    status: "processing",
    model,
    inputHash,
    quoteCount: analysisInput.quotes.length,
    analysis: existing?.analysis ?? null,
    errorMessage: null,
    startedAt,
    completedAt: null,
  });

  try {
    const analysis = analysisInput.quotes.length === 0
      ? {
          summary: "No transcript quotes were available for AI analysis.",
          pageInsights: [],
          findings: [],
          positiveFeedback: [],
          unclearFeedback: [],
        }
      : await callOpenAiForQuoteAnalysis(analysisInput, model);

    return await upsertAnalysis(admin, {
      reportId,
      status: "completed",
      model,
      inputHash,
      quoteCount: analysisInput.quotes.length,
      analysis,
      errorMessage: null,
      startedAt,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await upsertAnalysis(admin, {
      reportId,
      status: "failed",
      model,
      inputHash,
      quoteCount: analysisInput.quotes.length,
      analysis: null,
      errorMessage: error instanceof Error ? error.message : "Quote analysis failed.",
      startedAt,
      completedAt: new Date().toISOString(),
    });

    throw error;
  }
}
