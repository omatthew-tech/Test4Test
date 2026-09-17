import type { TranscriptSegment, TranscriptStatus } from "./transcriptReport";
import { callTranscriptEndpoint } from "./transcriptReports";

export interface TimedTranscriptWord {
  id: string;
  sequence: number;
  segmentIndex: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface RecordingTranscriptData {
  id: string;
  responseId: string;
  versionId?: string;
  source: { bucket: string; path: string };
  revision: string;
  status: TranscriptStatus;
  language: string | null;
  fullText: string;
  segments: TranscriptSegment[];
  words: TimedTranscriptWord[];
}

export function requestRecordingTranscript(
  userId: string,
  responseId: string,
  versionId: string | undefined,
  signal: AbortSignal,
) {
  return callTranscriptEndpoint<{ transcript: RecordingTranscriptData | null }>(
    "get-recording-transcript",
    { responseId, versionId },
    userId,
    signal,
  );
}

export interface TranscriptToken {
  text: string;
  startMs: number;
  endMs: number;
}

/** Keep the canonical segment text, including punctuation. Incomplete alignments use sentence timing. */
export function transcriptTokens(transcript: RecordingTranscriptData): TranscriptToken[] {
  const validTime = (item: TranscriptToken) =>
    Number.isFinite(item.startMs) &&
    Number.isFinite(item.endMs) &&
    item.startMs >= 0 &&
    item.endMs >= item.startMs;
  if (!transcript.segments.length)
    return transcript.words
      .filter(validTime)
      .map((word, index) => ({ ...word, text: `${index ? " " : ""}${word.text.trim()}` }));
  const groups = new Map<number, TimedTranscriptWord[]>();
  for (const word of transcript.words) {
    if (!validTime(word) || !word.text.trim()) continue;
    const group = groups.get(word.segmentIndex) ?? [];
    group.push(word);
    groups.set(word.segmentIndex, group);
  }
  return transcript.segments.flatMap((segment, index) => {
    if (!segment.text.trim() || !validTime(segment)) return [];
    const words = (groups.get(index) ?? []).sort((a, b) => a.sequence - b.sequence);
    const tokens: TranscriptToken[] = [];
    let cursor = 0;
    for (const word of words) {
      const text = word.text.trim();
      const start = segment.text.indexOf(text, cursor);
      if (start < 0 || /[\p{L}\p{N}]/u.test(segment.text.slice(cursor, start))) break;
      const end = start + text.length;
      tokens.push({
        text: segment.text.slice(cursor, end),
        startMs: word.startMs,
        endMs: word.endMs,
      });
      cursor = end;
    }
    const remaining = segment.text.slice(cursor);
    if (!tokens.length || tokens.length !== words.length || /[\p{L}\p{N}]/u.test(remaining)) {
      // A whole sentence is indivisible when no accurate word alignment exists.
      return [{ ...segment, text: `${index ? " " : ""}${segment.text.trim()}` }];
    }
    tokens[0].text = `${index ? " " : ""}${tokens[0].text.trimStart()}`;
    tokens[tokens.length - 1].text += remaining;
    return tokens;
  });
}

export interface TranscriptPage {
  start: number;
  end: number;
  endsAt: number;
}

/** Bounds come from the browser's actual wrapped word rectangles, never character estimates. */
export function paginateTranscript(
  tokens: TranscriptToken[],
  bounds: { top: number; bottom: number }[],
  lineHeight: number,
): TranscriptPage[] {
  if (!tokens.length || !bounds.length || lineHeight <= 0) return [];
  const pages: TranscriptPage[] = [];
  let start = 0;
  let top = bounds[0].top;
  let endsAt = 0;
  for (let index = 0; index < tokens.length; index++) {
    if (index > start && bounds[index].bottom - top > lineHeight * 4 + 1) {
      pages.push({ start, end: index, endsAt });
      start = index;
      top = bounds[index].top;
    }
    endsAt = Math.max(endsAt, tokens[index].endMs);
  }
  pages.push({ start, end: tokens.length, endsAt });
  return pages;
}

export function transcriptPageAt(pages: TranscriptPage[], timeMs: number) {
  const index = pages.findIndex((page) => timeMs < page.endsAt);
  return index < 0 ? pages.length - 1 : index;
}
