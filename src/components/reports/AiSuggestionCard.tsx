import { Sparkles } from "lucide-react";

/**
 * Floating / inline card for one AI UX suggestion on a screenshot page.
 * Clearly labeled as AI-generated so users know the source.
 */

export type AiSuggestionCardVariant = "floating" | "inline";

export interface AiSuggestionCardProps {
  /** One-sentence AI suggestion. Extra sentences are truncated for display. */
  suggestion: string;
  /** Accessible context, e.g. "Screen 3". */
  screenLabel?: string;
  /**
   * `floating` — overlays the bottom of a screenshot (default).
   * `inline` — sits under the screenshot as a full-width card.
   */
  variant?: AiSuggestionCardVariant;
  className?: string;
}

/** Keep display to a single sentence. */
export function clampToOneSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1].trim() : cleaned;
}

export function AiSuggestionCard({
  suggestion,
  screenLabel,
  variant = "floating",
  className,
}: AiSuggestionCardProps) {
  const text = clampToOneSentence(suggestion);

  if (!text) {
    return null;
  }

  const classes = [
    "ai-suggestion-card",
    `ai-suggestion-card--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      className={classes}
      aria-label={screenLabel ? `AI suggestion for ${screenLabel}` : "AI suggestion"}
    >
      <div className="ai-suggestion-card__badge">
        <Sparkles size={13} strokeWidth={2.4} aria-hidden="true" />
        <span>AI suggestion</span>
      </div>
      <p className="ai-suggestion-card__text">{text}</p>
    </aside>
  );
}

/** Empty / pending shell while quote analysis is still running. */
export function AiSuggestionCardPlaceholder({
  variant = "floating",
  className,
}: {
  variant?: AiSuggestionCardVariant;
  className?: string;
}) {
  const classes = [
    "ai-suggestion-card",
    "ai-suggestion-card--placeholder",
    `ai-suggestion-card--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={classes} aria-label="AI suggestion pending" aria-busy="true">
      <div className="ai-suggestion-card__badge">
        <Sparkles size={13} strokeWidth={2.4} aria-hidden="true" />
        <span>AI suggestion</span>
      </div>
      <p className="ai-suggestion-card__text ai-suggestion-card__text--muted">
        Preparing a suggestion for this screen…
      </p>
    </aside>
  );
}
