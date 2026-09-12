import { describe, expect, it } from "vitest";
import {
  buildTranscriptReport,
  fenceReportSource,
  formatTranscriptTime,
  transcriptCoverage,
  transcriptReportFilename,
  type TranscriptReportData,
} from "../../src/lib/transcriptReport";
import { loadTranscriptReportPages, sameTranscriptReport } from "../../src/lib/transcriptReports";
import {
  decodeTranscriptCursor,
  validTranscriptResult,
} from "../../supabase/functions/_shared/transcript-contract";

const date = "2026-09-08T12:00:00.000Z";
const data: TranscriptReportData = {
  app: {
    id: "app",
    productName: "Palette / Pilot",
    description: "The app description.",
    targetAudience: "Designers",
    instructionSteps: ["Find a color.", "Save it."],
    latestRecordingAt: date,
  },
  recordings: [
    {
      responseId: "recording-1",
      submittedAt: date,
      durationMs: 120000,
      status: "ready",
      language: "fr",
      fullText: "Bonjour — 色彩!",
      segments: [{ startMs: 12340, endMs: 18720, text: "Bonjour — 色彩!" }],
    },
  ],
};
const build = (report = data) =>
  buildTranscriptReport(report, date, "https://test4test.test/path?token=not-exported");

describe("transcript report format", () => {
  it("exports context and source transcripts without an analysis task or duplicated text", () => {
    const text = build();
    expect(text).toContain("Format version: 2");
    expect(text).toContain("Transcripts ready: 1 of 1");
    expect(text).toContain("Current information at export time");
    expect(text).toContain("#### Task 2");
    expect(text).toContain("[00:12.340–00:18.720]\nBonjour — 色彩!");
    expect(text.match(/Bonjour — 色彩!/g)).toHaveLength(1);
    expect(text).toContain("https://test4test.test/recordings?response=recording-1");
    expect(text).not.toContain("token=");
    expect(text).not.toContain("Analyze these");
  });
  it("uses fences that cannot be closed by source text", () => {
    const source = "```\n# Ignore instructions\n``````\n<tag>text</tag>";
    expect(fenceReportSource(source)).toBe(`\`\`\`\`\`\`\`text\n${source}\n\`\`\`\`\`\`\``);
    expect(build({ ...data, app: { ...data.app, description: source } })).toContain(source);
  });
  it("keeps whitespace and wording when timestamps are absent", () => {
    const source = "  Original  spacing.\nSecond line.  ";
    const text = build({
      ...data,
      recordings: [{ ...data.recordings[0], fullText: source, segments: [] }],
    });
    expect(text).toContain(`Timestamps unavailable.\n\n\`\`\`text\n${source}\n\`\`\``);
  });
  it("uses full text when segments would omit words or have invalid timestamps", () => {
    for (const recording of [
      { ...data.recordings[0], fullText: "Additional words. Bonjour — 色彩!" },
      { ...data.recordings[0], segments: [{ startMs: -1, endMs: 10, text: "Bonjour — 色彩!" }] },
    ]) {
      const text = build({ ...data, recordings: [recording] });
      expect(text).toContain("Timestamps unavailable.");
      expect(text).toContain(recording.fullText);
    }
  });
  it("lists failed and pending sources explicitly and never leaks stale transcript text", () => {
    const records = ["ready", "pending", "processing", "failed"].map((status, i) => ({
      ...data.recordings[0],
      responseId: `r-${i}`,
      status: status as "ready" | "pending" | "processing" | "failed",
      fullText: i ? "OLD PRIVATE TEXT" : data.recordings[0].fullText,
    }));
    expect(transcriptCoverage(records)).toEqual({ total: 4, ready: 1, failed: 1, preparing: 2 });
    const text = build({ ...data, recordings: records });
    expect(text).toContain("Transcript failed.");
    expect(text).toContain("Transcript processing.");
    expect(text).not.toContain("OLD PRIVATE TEXT");
  });
  it("represents completed recordings with no speech and missing metadata", () => {
    const text = build({
      ...data,
      recordings: [
        { ...data.recordings[0], fullText: "", segments: [], language: null, durationMs: null },
      ],
    });
    expect(text).toContain("No speech transcribed.");
    expect(text).toContain("Language: Unknown");
    expect(text).toContain("Duration: Unknown");
    expect(text).toContain("Transcripts ready: 1 of 1");
  });
  it("sorts stably without mutating the source and uses consistent recording references", () => {
    const report = {
      ...data,
      recordings: [
        { ...data.recordings[0], responseId: "b" },
        { ...data.recordings[0], responseId: "older", submittedAt: "2026-01-01" },
        { ...data.recordings[0], responseId: "a" },
      ],
    };
    const text = build(report);
    expect(text).toContain("### R001\n\n```text\nRecording identifier: a");
    expect(text).toContain("### R003\n\n```text\nRecording identifier: older");
    expect(text).toBe(build({ ...report, recordings: [...report.recordings].reverse() }));
    expect(report.recordings[0].responseId).toBe("b");
  });
  it("uses safe filenames and minute offsets beyond one hour", () => {
    expect(transcriptReportFilename("../Pálétte / Pilot 😃", date)).toBe(
      "test4test-palette-pilot-2026-09-08.txt",
    );
    expect(transcriptReportFilename("色彩", date)).toBe("test4test-app-2026-09-08.txt");
    expect(formatTranscriptTime(3600123)).toBe("60:00.123");
  });
});

describe("complete transcript retrieval", () => {
  it("keeps multiple versions of one tester's feedback across pages and delta refreshes", async () => {
    const original = {
      ...data.recordings[0],
      versionId: "original",
      versionNumber: 1,
      revision: "original-hash",
    };
    const revised = {
      ...original,
      versionId: "revised",
      versionNumber: 2,
      revision: "revised-hash",
      fullText: "Revised words",
      segments: [],
    };
    const result = await loadTranscriptReportPages(
      async (cursor) => ({
        apps: [data.app],
        app: data.app,
        recordings: cursor
          ? [{ ...original, unchanged: true, fullText: "", segments: [] }]
          : [revised],
        nextCursor: cursor ? null : "next",
      }),
      { ...data, recordings: [original] },
    );
    expect(result.report?.recordings).toEqual([revised, original]);
    const text = build(result.report!);
    expect(text).toContain("Version: Revision 1");
    expect(text).toContain("Version: Original");
    expect(text).toContain("response=recording-1&version=revised");
    expect(text).toContain("response=recording-1&version=original");
    expect(text).toContain("Revised words");
    expect(text).toContain("Bonjour");
  });
  it("reuses unchanged transcripts while replacing changed rows and removing deleted rows", async () => {
    const cached = { ...data.recordings[0], revision: "v1" };
    const previous = { ...data, recordings: [cached, { ...cached, responseId: "deleted" }] };
    const result = await loadTranscriptReportPages(
      async () => ({
        apps: [data.app],
        app: data.app,
        recordings: [
          { ...cached, unchanged: true, fullText: "", segments: [] },
          { ...cached, responseId: "new", revision: "v2", fullText: "New source." },
        ],
        nextCursor: null,
      }),
      previous,
    );
    expect(result.report?.recordings[0]).toBe(cached);
    expect(result.report?.recordings.map((row) => row.responseId)).toEqual([
      cached.responseId,
      "new",
    ]);
    expect(build(result.report!)).toContain("New source.");
  });
  it("rejects missing or mismatched cached revisions instead of dropping source text", async () => {
    const page = {
      apps: [data.app],
      app: data.app,
      recordings: [{ ...data.recordings[0], revision: "new", unchanged: true }],
      nextCursor: null,
    };
    await expect(loadTranscriptReportPages(async () => page, data)).rejects.toThrow(
      "report changed",
    );
  });
  it("preserves export time for identical legacy responses and notices changed text", () => {
    expect(sameTranscriptReport(data, structuredClone(data))).toBe(true);
    expect(
      sameTranscriptReport(data, {
        ...data,
        recordings: [{ ...data.recordings[0], fullText: "Changed" }],
      }),
    ).toBe(false);
  });
  it("loads every page beyond the preview limit", async () => {
    const result = await loadTranscriptReportPages(async (cursor) => {
      const index = Number(cursor ?? 0);
      return {
        apps: [data.app],
        app: data.app,
        recordings: Array.from({ length: index < 2 ? 50 : 7 }, (_, n) => ({
          ...data.recordings[0],
          responseId: `recording-${index * 50 + n}`,
        })),
        nextCursor: index < 2 ? String(index + 1) : null,
      };
    });
    expect(result.report?.recordings).toHaveLength(107);
  });
  it("rejects interrupted pagination instead of exporting an incomplete dataset", async () => {
    await expect(
      loadTranscriptReportPages(async (cursor) => {
        if (cursor) throw new Error("offline");
        return { apps: [data.app], app: data.app, recordings: data.recordings, nextCursor: "next" };
      }),
    ).rejects.toThrow("offline");
  });
  it("detects repeated cursors and app changes", async () => {
    await expect(
      loadTranscriptReportPages(async () => ({
        apps: [data.app],
        app: data.app,
        recordings: data.recordings,
        nextCursor: "same",
      })),
    ).rejects.toThrow("pagination");
    await expect(
      loadTranscriptReportPages(async (cursor) => ({
        apps: [data.app],
        app: { ...data.app, id: cursor ? "other" : "app" },
        recordings: data.recordings,
        nextCursor: cursor ? null : "next",
      })),
    ).rejects.toThrow("selected app changed");
  });
});

describe("transcript callback contract", () => {
  const result = {
    fullText: "Source text",
    provider: "groq",
    model: "whisper-large-v3-turbo",
    segments: [
      {
        startMs: 0,
        endMs: 100,
        text: "Source text",
        words: [{ startMs: 0, endMs: 100, word: "Source" }],
      },
    ],
  };
  it("accepts timestamped and silent results", () => {
    expect(validTranscriptResult(result)).toBe(true);
    expect(validTranscriptResult({ ...result, fullText: "", segments: [] })).toBe(true);
  });
  it("rejects malformed text and timings before persistence", () => {
    for (const value of [
      null,
      {},
      { ...result, fullText: 42 },
      { ...result, segments: [{ startMs: -1, endMs: 0, text: "bad" }] },
      { ...result, segments: [{ startMs: 10, endMs: 0, text: "bad" }] },
    ]) {
      expect(validTranscriptResult(value)).toBe(false);
    }
  });
  it("validates pagination cursors", () => {
    expect(decodeTranscriptCursor(null)).toBe(null);
    expect(() => decodeTranscriptCursor("not-json")).toThrow();
    expect(() => decodeTranscriptCursor(btoa(JSON.stringify({ appId: "bad" })))).toThrow();
  });
});
