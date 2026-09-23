// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  readRecordingTranscript,
  retryCompatibleTranscript,
} from "../../supabase/functions/_shared/recording-transcript";

type Row = Record<string, unknown>;
function database(options: { versioned?: boolean; wordCount?: number } = {}) {
  const rows: Record<string, Row[]> = {
    test_responses: [
      {
        id: "response",
        submission_id: "app",
        recording_bucket: "r2:media",
        recording_path: "current.webm",
        recording_deleted_at: null,
      },
    ],
    submissions: [{ id: "app", user_id: "owner" }],
    test_response_versions: [
      {
        id: "original",
        response_id: "response",
        recording_bucket: "r2:media",
        recording_path: "old.webm",
        recording_deleted_at: null,
      },
    ],
    recording_transcripts: [
      {
        id: "transcript",
        response_id: "response",
        owner_user_id: "owner",
        source_bucket: "r2:media",
        source_path: "current.webm",
        status: "ready",
        full_text: "Hello world",
        segments: [],
        updated_at: "revision-1",
      },
    ],
    transcript_words: Array.from({ length: options.wordCount ?? 2 }, (_, sequence) => ({
      id: `word-${sequence}`,
      transcript_id: "transcript",
      sequence,
      segment_index: 0,
      start_ms: sequence * 500,
      end_ms: sequence * 500 + 400,
      text: "word",
    })),
  };
  const calls: string[] = [];
  let onRead: ((table: string) => void) | undefined;
  let failure: string | undefined;
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let limit = 1000;
      let single = false;
      const builder = {
        select() {
          return builder;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return builder;
        },
        gt(key: string, value: number) {
          filters.push((row) => Number(row[key]) > value);
          return builder;
        },
        order() {
          return builder;
        },
        limit(value: number) {
          limit = value;
          return builder;
        },
        maybeSingle() {
          single = true;
          return builder;
        },
        then(
          resolve: (result: {
            data: Row | Row[] | null;
            error: { code: string } | null;
          }) => unknown,
        ) {
          calls.push(table);
          onRead?.(table);
          if (table === failure || (table === "test_response_versions" && !options.versioned))
            return Promise.resolve(
              resolve({ data: null, error: { code: table === failure ? "XX000" : "PGRST205" } }),
            );
          const data = rows[table]
            .filter((row) => filters.every((filter) => filter(row)))
            .slice(0, limit);
          return Promise.resolve(
            resolve({ data: structuredClone(single ? (data[0] ?? null) : data), error: null }),
          );
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return {
    client,
    rows,
    calls,
    onRead: (callback: typeof onRead) => {
      onRead = callback;
    },
    fail: (table: string) => {
      failure = table;
    },
  };
}

describe("recording transcript access", () => {
  it("denies locked transcript content before querying text or timed words", async () => {
    const db = database();
    db.rows.test_responses[0].feedback_source = "earn";
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ response_id: "response", access: "locked" }], error: null });
    Object.assign(db.client, { rpc });
    await expect(readRecordingTranscript(db.client, "owner", "response")).rejects.toMatchObject({
      status: 403,
    });
    expect(db.calls).not.toContain("recording_transcripts");
    expect(db.calls).not.toContain("transcript_words");
    rpc.mockResolvedValue({ data: [{ response_id: "response", access: "unlocked" }], error: null });
    expect(
      (await readRecordingTranscript(db.client, "owner", "response")).transcript?.words,
    ).toHaveLength(2);
  });
  it("reads all 1,437 words without consulting unavailable history", async () => {
    const db = database({ wordCount: 1437 });
    const result = await readRecordingTranscript(db.client, "owner", "response");
    expect(result.transcript?.words).toHaveLength(1437);
    expect(result.transcript?.words[1436].sequence).toBe(1436);
    expect(db.calls).not.toContain("test_response_versions");
    expect(db.calls.filter((table) => table === "transcript_words")).toHaveLength(4);
  });
  it("denies a different owner before reading transcript text", async () => {
    const db = database();
    await expect(readRecordingTranscript(db.client, "other", "response")).rejects.toMatchObject({
      status: 404,
    });
    expect(db.calls).not.toContain("recording_transcripts");
  });
  it("never substitutes latest for a missing explicit version", async () => {
    const db = database();
    await expect(
      readRecordingTranscript(db.client, "owner", "response", "original"),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.calls).not.toContain("recording_transcripts");
  });
  it("reads only the exact retained version on a versioned backend", async () => {
    const db = database({ versioned: true });
    db.rows.recording_transcripts.push({
      ...db.rows.recording_transcripts[0],
      id: "old-transcript",
      version_id: "original",
      source_path: "old.webm",
    });
    const result = await readRecordingTranscript(db.client, "owner", "response", "original");
    expect(result.transcript?.id).toBe("old-transcript");
    expect(result.transcript?.words).toEqual([]);
  });
  it("rejects deleted sources and ignores transcripts from replaced sources", async () => {
    const db = database();
    db.rows.test_responses[0].recording_deleted_at = "deleted";
    await expect(readRecordingTranscript(db.client, "owner", "response")).rejects.toMatchObject({
      status: 404,
    });
    db.rows.test_responses[0].recording_deleted_at = null;
    db.rows.test_responses[0].recording_path = "replacement.webm";
    expect(await readRecordingTranscript(db.client, "owner", "response")).toEqual({
      transcript: null,
    });
  });
  it.each(["source", "revision", "owner"])(
    "rejects %s changes during pagination",
    async (change) => {
      const db = database();
      db.onRead((table) => {
        if (table !== "transcript_words") return;
        if (change === "source") db.rows.test_responses[0].recording_path = "replacement.webm";
        if (change === "revision") db.rows.recording_transcripts[0].updated_at = "revision-2";
        if (change === "owner") db.rows.submissions[0].user_id = "other";
      });
      await expect(readRecordingTranscript(db.client, "owner", "response")).rejects.toMatchObject({
        status: change === "owner" ? 404 : 409,
      });
    },
  );
  it("never returns partial data after a word fetch failure", async () => {
    const db = database();
    db.fail("transcript_words");
    await expect(readRecordingTranscript(db.client, "owner", "response")).rejects.toThrow();
  });
  it.each(["pending", "processing", "failed"])("withholds stale text while %s", async (status) => {
    const db = database();
    db.rows.recording_transcripts[0].status = status;
    const result = await readRecordingTranscript(db.client, "owner", "response");
    expect(result.transcript).toMatchObject({ status, fullText: "", words: [], segments: [] });
    expect(db.calls).not.toContain("transcript_words");
  });
  it("retries legacy recordings but never drops an explicit version or hides unrelated errors", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "PGRST202" } })
      .mockResolvedValueOnce({ data: true });
    expect(
      await retryCompatibleTranscript(
        { rpc } as unknown as Pick<SupabaseClient, "rpc">,
        "owner",
        "response",
      ),
    ).toBe(true);
    expect(rpc.mock.calls[1][1]).toEqual({ p_owner: "owner", p_response_id: "response" });
    for (const [code, version] of [
      ["PGRST202", "original"],
      ["XX000", undefined],
    ]) {
      rpc.mockReset().mockResolvedValue({ error: { code } });
      await expect(
        retryCompatibleTranscript(
          { rpc } as unknown as Pick<SupabaseClient, "rpc">,
          "owner",
          "response",
          version,
        ),
      ).rejects.toThrow();
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
});
