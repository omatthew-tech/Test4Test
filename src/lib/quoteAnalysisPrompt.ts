export type ReportQuoteInput = {
  quoteId: string;
  testResponseId: string;
  testerLabel?: string;
  timestampMs: number;
  linkedFrameId?: string | null;
  text: string;
};

export type BuildQuoteAnalysisPromptInput = {
  appName: string;
  quotes: ReportQuoteInput[];
};

export const quoteAnalysisPromptVersion = "quote-analysis-v4";

const QUOTE_ANALYSIS_PROMPT_TEMPLATE = `You are analyzing usability testing transcript quotes for a software product.

Your job is to extract usability-relevant feedback, turn it into structured report findings, and decide which individual screenshot pages contain actionable usability-testing insight.

The input may contain casual speech, filler words, incomplete thoughts, and narration. Ignore filler unless it supports a usability finding.

Analyze the report as a whole for aggregate findings. For pageInsights, analyze every PAGE independently and evaluate all quotes in that PAGE together. The PAGE frameId identifies the screenshot where those quotes occurred, but the screenshot itself is not included.

Rules:

- Do not invent issues that are not supported by the quotes.
- Use direct quote evidence when possible.
- Evidence entries must reference quoteId values from the provided input.
- Group similar comments into the same finding when they describe the same underlying usability issue.
- If a comment is unclear, put it in unclearFeedback instead of guessing.
- Keep findings concise and useful for a product team.
- Return valid JSON only.
- Do not include markdown.
- Do not include explanations outside of the JSON.
- Do not include filler quotes unless they support a usability finding.
- Return no more than 8 findings, 5 positiveFeedback items, and 10 unclearFeedback items.
- For each finding or positiveFeedback item, include no more than 4 strongest evidence entries. Use quoteCount and recordingCount for the full support counts.
- Return exactly one pageInsights entry for every PAGE frameId in the input, in the same order.
- Pages with no quotes must return usefulForUsabilityTesting false and suggestion null.
- Mark usefulForUsabilityTesting true when that page's quotes reveal a concrete problem, confusion, friction, unmet expectation, or high-value improvement opportunity.
- Treat qualified or mixed feedback as actionable when it contains a specific concern. For example, a page described as easy but also as having too much going on should receive a suggestion addressing the clutter concern.
- Set suggestion to null whenever usefulForUsabilityTesting is false.
- When usefulForUsabilityTesting is true, suggestion must be exactly one concise, actionable sentence describing what the product owner should improve on that page.
- Ground page suggestions only in the quotes for that PAGE; do not infer unseen visual details.
- Positive-only, descriptive, filler, or genuinely ambiguous page comments should return false and null, but do not discard a clear criticism merely because it is surrounded by positive language or casual speech.

Frequency rules:

- Use "repeated" only when the same issue is supported by quotes from more than one recording/testResponseId.
- Use "one_off" when the issue appears in only one recording/testResponseId.
- If one tester mentions the same issue multiple times, count the supporting quotes, but still mark frequency as "one_off" unless another tester or recording also supports it.

Severity rules:

- Use "high" when the issue blocks task completion, causes major confusion, or prevents the user from using a feature.
- Use "medium" when the issue slows the user down, creates confusion, or makes an important feature harder to use.
- Use "low" when the issue is minor, cosmetic, wording-related, or a small improvement suggestion.

Category rules:

Use one of these categories:

- "navigation" for wayfinding, menus, scrolling, search, filters, or moving through the product.
- "visual_design" for layout, visual clutter, unclear graphics, color, spacing, or visual hierarchy.
- "content" for wording, labels, unclear terminology, or missing explanations.
- "functionality" for broken, missing, or non-working features.
- "performance" for loading, lag, speed, or responsiveness.
- "accessibility" for readability, contrast, keyboard access, screen reader concerns, or accessibility barriers.
- "data_clarity" for charts, metrics, analytics, calculations, legends, or confusing data displays.
- "other" if none of the above fit.

Return this JSON structure:

{
  "summary": "Short summary of the overall usability feedback.",
  "pageInsights": [
    {
      "frameId": "frame-1",
      "usefulForUsabilityTesting": true,
      "suggestion": "Make the primary action easier to identify."
    }
  ],
  "findings": [
    {
      "title": "Short issue title",
      "category": "navigation | visual_design | content | functionality | performance | accessibility | data_clarity | other",
      "severity": "low | medium | high",
      "frequency": "one_off | repeated",
      "quoteCount": 0,
      "recordingCount": 0,
      "description": "Clear explanation of the issue.",
      "evidence": [
        {
          "quoteId": "quote-1",
          "testResponseId": "recording-1",
          "testerLabel": "Tester 1",
          "timestampMs": 0,
          "linkedFrameId": "frame-1 or null",
          "quote": "Relevant transcript quote or close excerpt."
        }
      ],
      "affectedArea": "screen, feature, chart, button, map, or unknown",
      "recommendation": "Suggested UX improvement."
    }
  ],
  "positiveFeedback": [
    {
      "summary": "What users liked.",
      "quoteCount": 0,
      "recordingCount": 0,
      "evidence": [
        {
          "quoteId": "quote-1",
          "testResponseId": "recording-1",
          "testerLabel": "Tester 1",
          "timestampMs": 0,
          "linkedFrameId": "frame-1 or null",
          "quote": "Relevant transcript quote or close excerpt."
        }
      ]
    }
  ],
  "unclearFeedback": [
    {
      "quoteId": "quote-1",
      "testResponseId": "recording-1",
      "testerLabel": "Tester 1",
      "timestampMs": 0,
      "linkedFrameId": "frame-1 or null",
      "quote": "Unclear quote.",
      "reason": "Why this feedback could not be confidently interpreted."
    }
  ]
}`;

function normalizeQuote(quote: ReportQuoteInput) {
  return {
    quoteId: quote.quoteId,
    testResponseId: quote.testResponseId,
    testerLabel: quote.testerLabel?.trim() || "Tester",
    timestampMs: Math.max(0, Math.round(quote.timestampMs)),
    linkedFrameId: quote.linkedFrameId ?? null,
    text: quote.text.trim(),
  };
}

function groupQuotesByPage(quotes: ReturnType<typeof normalizeQuote>[]) {
  const pages = new Map<string, {
    frameId: string;
    testResponseId: string;
    testerLabel: string;
    quotes: ReturnType<typeof normalizeQuote>[];
  }>();

  for (const quote of quotes) {
    if (!quote.linkedFrameId) {
      continue;
    }

    const page = pages.get(quote.linkedFrameId);
    if (page) {
      page.quotes.push(quote);
    } else {
      pages.set(quote.linkedFrameId, {
        frameId: quote.linkedFrameId,
        testResponseId: quote.testResponseId,
        testerLabel: quote.testerLabel,
        quotes: [quote],
      });
    }
  }

  return [...pages.values()];
}

export function buildQuoteAnalysisPrompt(
  input: BuildQuoteAnalysisPromptInput,
): string {
  const quotes = input.quotes.map(normalizeQuote).filter((quote) => quote.text);
  const pages = groupQuotesByPage(quotes);
  const linkedQuoteIds = new Set(pages.flatMap((page) => page.quotes.map((quote) => quote.quoteId)));
  const unlinkedQuotes = quotes.filter((quote) => !linkedQuoteIds.has(quote.quoteId));

  return `${QUOTE_ANALYSIS_PROMPT_TEMPLATE}

Product/app name: ${input.appName}

Pages to analyze:

${JSON.stringify(pages, null, 2)}

Quotes that could not be linked to a screenshot page (include these only in aggregate findings):

${JSON.stringify(unlinkedQuotes, null, 2)}`;
}
