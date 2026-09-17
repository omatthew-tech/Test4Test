import type { RecordingTranscriptData } from "../lib/recordingTranscript";

export function recordingTranscriptFixture(
  responseId: string,
  source: { bucket: string; path: string },
  scenario: string | null,
  versionId?: string,
): RecordingTranscriptData | null {
  if (!scenario) return null;
  const text = Array.from(
    { length: 16 },
    (_, index) =>
      `Section ${index + 1}. I can find the navigation and understand where to start. The recording helps explain what happens when I explore this page.`,
  ).join(" ");
  const words = text.split(" ").map((word, sequence) => ({
    id: `word-${sequence}`,
    sequence,
    segmentIndex: 0,
    text: word,
    startMs: 500 + sequence * 500,
    endMs: 900 + sequence * 500,
  }));
  return {
    id: `${responseId}-transcript`,
    responseId,
    versionId,
    source,
    revision: "fixture",
    status: scenario === "failed" ? "failed" : scenario === "processing" ? "processing" : "ready",
    language: "en",
    fullText: scenario === "empty" ? "" : text,
    words: ["empty", "untimed"].includes(scenario) ? [] : words,
    segments: ["empty", "untimed"].includes(scenario)
      ? []
      : [{ text, startMs: 500, endMs: words[words.length - 1].endMs }],
  };
}
