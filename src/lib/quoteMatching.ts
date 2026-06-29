import { UsabilityReportFrame, UsabilityReportQuote } from "../types";

/**
 * Quote → screenshot matching.
 *
 * Screenshots are captured at exact moments in a recording. A screenshot is
 * considered "on screen" from its own timestamp until the next screenshot's
 * timestamp for the SAME recording, i.e. it owns the half-open range
 * `[startMs, endMs)`. A quote (with its own exact timestamp) is linked to the
 * screenshot whose range contains the quote's timestamp.
 *
 * Frames may optionally carry explicit `startMs` / `endMs`; when absent the
 * window is derived from neighboring frames. Matching is always scoped to a
 * single recording via `testResponseId` so quotes from one tester never link to
 * another tester's screenshots — this lets the same helper drive both the
 * summary view (all testers) and an individual response page.
 */

/** Minimal screenshot shape the matcher needs. Satisfied by UsabilityReportFrame. */
export interface FrameLike {
  id: string;
  testResponseId: string;
  timestampMs: number;
  startMs?: number | null;
  endMs?: number | null;
  url?: string | null;
}

/** Minimal quote shape the matcher needs. Satisfied by UsabilityReportQuote. */
export interface QuoteLike {
  timestampMs: number;
  /** When omitted, the quote is matched against all frames on a single timeline. */
  testResponseId?: string | null;
}

export interface FrameRange<TFrame extends FrameLike = FrameLike> {
  frame: TFrame;
  /** Inclusive start of the display window, in milliseconds. */
  startMs: number;
  /** Exclusive end of the display window, in milliseconds (Infinity for the last frame). */
  endMs: number;
}

export interface MatchOptions {
  /**
   * When true (default), a quote that falls outside every frame range (e.g.
   * before the first screenshot, or in a gap created by explicit end times) is
   * linked to the nearest preceding frame, or the first frame if it precedes
   * all of them. When false, such quotes return null.
   */
  clampToNearest?: boolean;
}

function frameStart(frame: FrameLike): number {
  return typeof frame.startMs === "number" ? frame.startMs : frame.timestampMs;
}

/**
 * Build ordered, half-open display ranges for a set of frames that belong to the
 * SAME recording. Each frame owns `[start, end)` where `end` is its explicit
 * `endMs`, otherwise the next frame's start, otherwise Infinity.
 */
export function buildFrameRanges<TFrame extends FrameLike>(
  frames: readonly TFrame[],
): Array<FrameRange<TFrame>> {
  const sorted = [...frames].sort((a, b) => frameStart(a) - frameStart(b));

  return sorted.map((frame, index) => {
    const startMs = frameStart(frame);
    const next = sorted[index + 1];
    const derivedEnd = next ? frameStart(next) : Number.POSITIVE_INFINITY;
    const explicitEnd = typeof frame.endMs === "number" ? frame.endMs : null;
    const endMs = explicitEnd ?? derivedEnd;

    return { frame, startMs, endMs: Math.max(endMs, startMs) };
  });
}

function matchWithinRanges<TFrame extends FrameLike>(
  ranges: ReadonlyArray<FrameRange<TFrame>>,
  timestampMs: number,
  clampToNearest: boolean,
): TFrame | null {
  if (ranges.length === 0) {
    return null;
  }

  for (const range of ranges) {
    if (timestampMs >= range.startMs && timestampMs < range.endMs) {
      return range.frame;
    }
  }

  if (!clampToNearest) {
    return null;
  }

  // Ranges are sorted by start. Anything before the first frame clamps to it.
  const first = ranges[0]!;
  if (timestampMs < first.startMs) {
    return first.frame;
  }

  // Otherwise clamp to the latest frame that started at or before the quote.
  let best = first;
  for (const range of ranges) {
    if (range.startMs <= timestampMs) {
      best = range;
    } else {
      break;
    }
  }

  return best.frame;
}

function scopeFramesToQuote<TFrame extends FrameLike>(
  quote: QuoteLike,
  frames: readonly TFrame[],
): TFrame[] {
  if (!quote.testResponseId) {
    return [...frames];
  }

  return frames.filter((frame) => frame.testResponseId === quote.testResponseId);
}

/**
 * Find the single screenshot that was on screen when `quote` was spoken.
 * Returns null when there are no candidate frames (and, if clamping is disabled,
 * when the quote falls outside every range).
 *
 * For matching many quotes against the same frame set, prefer
 * `createQuoteFrameMatcher` so ranges are computed once.
 */
export function matchQuoteToFrame<TFrame extends FrameLike>(
  quote: QuoteLike,
  frames: readonly TFrame[],
  options: MatchOptions = {},
): TFrame | null {
  const scoped = scopeFramesToQuote(quote, frames);
  const ranges = buildFrameRanges(scoped);
  return matchWithinRanges(ranges, quote.timestampMs, options.clampToNearest ?? true);
}

/**
 * Precompute frame ranges once and return a reusable matcher. Ranges are grouped
 * by `testResponseId`; quotes without a `testResponseId` match against a single
 * combined timeline of all frames.
 */
export function createQuoteFrameMatcher<TFrame extends FrameLike>(
  frames: readonly TFrame[],
  options: MatchOptions = {},
): (quote: QuoteLike) => TFrame | null {
  const clampToNearest = options.clampToNearest ?? true;

  const framesByResponse = new Map<string, TFrame[]>();
  for (const frame of frames) {
    const list = framesByResponse.get(frame.testResponseId);
    if (list) {
      list.push(frame);
    } else {
      framesByResponse.set(frame.testResponseId, [frame]);
    }
  }

  const rangesByResponse = new Map<string, Array<FrameRange<TFrame>>>();
  for (const [responseId, list] of framesByResponse) {
    rangesByResponse.set(responseId, buildFrameRanges(list));
  }

  const combinedRanges = buildFrameRanges(frames);

  return (quote: QuoteLike) => {
    const ranges = quote.testResponseId
      ? rangesByResponse.get(quote.testResponseId) ?? []
      : combinedRanges;
    return matchWithinRanges(ranges, quote.timestampMs, clampToNearest);
  };
}

/** A quote augmented with its resolved screenshot link. */
export type LinkedQuote<TQuote extends QuoteLike> = TQuote & {
  linkedFrameId: string | null;
  linkedFrameUrl: string | null;
};

/**
 * Link every quote to its matching screenshot, attaching `linkedFrameId` and
 * `linkedFrameUrl`. Use this to prepare quotes for both the summary view and
 * individual response pages.
 */
export function linkQuotesToFrames<TQuote extends QuoteLike, TFrame extends FrameLike>(
  quotes: readonly TQuote[],
  frames: readonly TFrame[],
  options: MatchOptions = {},
): Array<LinkedQuote<TQuote>> {
  const match = createQuoteFrameMatcher(frames, options);

  return quotes.map((quote) => {
    const frame = match(quote);
    return {
      ...quote,
      linkedFrameId: frame?.id ?? null,
      linkedFrameUrl: frame?.url ?? null,
    };
  });
}

/**
 * Convenience wrapper typed to the app's domain models. Returns report quotes
 * with their `linkedFrameId` / `linkedFrameUrl` populated from the report frames.
 */
export function linkReportQuotes(
  quotes: readonly UsabilityReportQuote[],
  frames: readonly UsabilityReportFrame[],
  options?: MatchOptions,
): UsabilityReportQuote[] {
  return linkQuotesToFrames(quotes, frames, options).map((quote) => ({
    ...quote,
    linkedFrameId: quote.linkedFrameId,
    linkedFrameUrl: quote.linkedFrameUrl,
  }));
}
