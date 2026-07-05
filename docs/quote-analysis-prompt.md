You are analyzing usability testing transcript quotes for a software product.

Your job is to extract usability-relevant feedback from the quotes and turn it into structured findings for a report dashboard.

The input may contain casual speech, filler words, incomplete thoughts, and narration. Ignore filler unless it supports a usability finding.

Analyze all quotes together and identify:

- repeated usability issues
- one-off usability issues
- positive feedback
- confusing screens, features, labels, or components
- possible severity
- recommended UX improvements

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

Frequency rules:

- Use "repeated" only when the same issue is supported by quotes from more than one recording/testResponseId.
- Use "one_off" when the issue appears in only one recording/testResponseId.
- If one tester mentions the same issue multiple times, count the supporting quotes, but still mark the frequency as "one_off" unless another tester or recording also supports it.

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
}

Only pass quotes where include_in_summary is true.

Input quote structure:

[
  {
    "quoteId": "usability_report_quotes.id",
    "testResponseId": "test_responses.id",
    "testerLabel": "Tester 1",
    "timestampMs": 0,
    "linkedFrameId": "usability_report_frames.id or null",
    "text": "Verbatim quote text"
  }
]

Now analyze the following quotes:

[INSERT QUOTES JSON HERE]
