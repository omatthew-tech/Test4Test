export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TranscriptCursor {
  appId: string;
  asOf: string;
  afterTime: string;
  afterId: string;
}

export function decodeTranscriptCursor(value: unknown): TranscriptCursor | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 1000) throw new Error("Invalid report cursor.");
  const cursor = JSON.parse(atob(value)) as TranscriptCursor;
  if (
    !cursor ||
    !UUID_PATTERN.test(cursor.appId) ||
    !UUID_PATTERN.test(cursor.afterId) ||
    typeof cursor.asOf !== "string" ||
    !Number.isFinite(Date.parse(cursor.asOf)) ||
    typeof cursor.afterTime !== "string" ||
    !Number.isFinite(Date.parse(cursor.afterTime))
  ) {
    throw new Error("Invalid report cursor.");
  }
  return cursor;
}

export function validTranscriptResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (
    typeof result.fullText !== "string" ||
    typeof result.provider !== "string" ||
    !result.provider ||
    typeof result.model !== "string" ||
    !result.model ||
    !(result.language == null || typeof result.language === "string") ||
    !(result.durationMs == null || nonnegativeInteger(result.durationMs)) ||
    !Array.isArray(result.segments)
  )
    return false;
  let previousStart = -1;
  return result.segments.every((segment: Record<string, unknown>) => {
    if (
      !segment ||
      typeof segment.text !== "string" ||
      !nonnegativeInteger(segment.startMs) ||
      !nonnegativeInteger(segment.endMs) ||
      segment.endMs < segment.startMs ||
      segment.startMs < previousStart
    )
      return false;
    previousStart = segment.startMs;
    if (segment.words === undefined) return true;
    return (
      Array.isArray(segment.words) &&
      segment.words.every(
        (word: Record<string, unknown>) =>
          word &&
          typeof word.word === "string" &&
          word.word.trim().length > 0 &&
          nonnegativeInteger(word.startMs) &&
          nonnegativeInteger(word.endMs) &&
          word.endMs >= word.startMs,
      )
    );
  });
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
