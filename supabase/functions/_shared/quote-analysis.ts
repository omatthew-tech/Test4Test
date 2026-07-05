import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const quoteAnalysisPromptVersion = "quote-analysis-v1";

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

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
  quote_text: string;
  include_in_summary: boolean;
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

export interface QuoteAnalysisResult {
  summary: string;
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
  linkedFrameId: string | null;
  text: string;
}

interface ReportQuoteAnalysisInput {
  reportId: string;
  appName: string;
  quotes: AnalysisQuoteInput[];
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

function getTesterLabel(row: Pick<QuoteRow, "test_responses">) {
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
  const { data: quoteRows, error: quoteError } = await admin
    .from("usability_report_quotes")
    .select(`
      id,
      test_response_id,
      frame_id,
      timestamp_ms,
      quote_text,
      include_in_summary,
      test_responses (
        anonymous_label
      )
    `)
    .eq("report_id", reportId)
    .eq("include_in_summary", true)
    .order("test_response_id", { ascending: true })
    .order("timestamp_ms", { ascending: true });

  if (quoteError) {
    throw new Error(quoteError.message);
  }

  const quotes = ((quoteRows ?? []) as QuoteRow[])
    .map((quote) => ({
      quoteId: quote.id,
      testResponseId: quote.test_response_id,
      testerLabel: getTesterLabel(quote),
      timestampMs: quote.timestamp_ms,
      linkedFrameId: quote.frame_id,
      text: normalizeText(quote.quote_text),
    }))
    .filter((quote) => quote.text);

  return {
    reportId,
    appName: getSubmissionProductName(report),
    quotes,
  };
}

async function hashInput(input: ReportQuoteAnalysisInput) {
  const body = JSON.stringify({
    promptVersion: quoteAnalysisPromptVersion,
    appName: input.appName,
    quotes: input.quotes,
  });
  const encoded = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildQuoteAnalysisPrompt(input: ReportQuoteAnalysisInput) {
  return [
    "You are analyzing usability testing transcript quotes for a software product.",
    "",
    "Your job is to extract usability-relevant feedback from the quotes and turn it into structured findings for a report dashboard.",
    "",
    "The input may contain casual speech, filler words, incomplete thoughts, and narration. Ignore filler unless it supports a usability finding.",
    "",
    "Analyze all quotes together and identify repeated usability issues, one-off usability issues, positive feedback, confusing screens/features/labels/components, possible severity, and recommended UX improvements.",
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
    "Quotes to analyze:",
    JSON.stringify(input.quotes, null, 2),
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
    findings: {
      type: "array",
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
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          quoteCount: { type: "integer" },
          recordingCount: { type: "integer" },
          evidence: {
            type: "array",
            items: quoteEvidenceSchema,
          },
        },
        required: ["summary", "quoteCount", "recordingCount", "evidence"],
      },
    },
    unclearFeedback: {
      type: "array",
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
  required: ["summary", "findings", "positiveFeedback", "unclearFeedback"],
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

function normalizeAnalysisPayload(value: unknown): QuoteAnalysisResult {
  const payload = value as Partial<QuoteAnalysisResult>;
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const positiveFeedback = Array.isArray(payload.positiveFeedback) ? payload.positiveFeedback : [];
  const unclearFeedback = Array.isArray(payload.unclearFeedback) ? payload.unclearFeedback : [];

  return {
    summary: normalizeText(payload.summary),
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
      max_output_tokens: 3200,
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

  if (!responseText) {
    throw new Error("OpenAI returned an empty quote analysis response.");
  }

  return normalizeAnalysisPayload(JSON.parse(responseText));
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
