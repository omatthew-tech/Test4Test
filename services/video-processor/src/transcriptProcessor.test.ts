import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_ACCESS_KEY_ID = "test-key";
process.env.CLOUDFLARE_SECRET_ACCESS_KEY = "test-secret";
process.env.CLOUDFLARE_BUCKET_NAME = "test-frames";
process.env.CLOUDFLARE_SOURCE_BUCKET_NAME = "test-recordings";
process.env.CLOUDFLARE_ENDPOINT = "https://example.invalid";
process.env.WORKER_SHARED_SECRET = "test-worker-secret";
process.env.TRANSCRIPT_COMPLETION_WEBHOOK_URL =
  "https://transcripts.example.test/functions/v1/complete-recording-transcript";
process.env.GROQ_API_KEY = "fixture-key";
process.env.GROQ_TRANSCRIPTION_LANGUAGE = "";
process.env.GROQ_TRANSCRIPTION_PROMPT = "";

const responseId = "91000000-0000-0000-0000-000000000001";
const attemptId = "91000000-0000-0000-0000-000000000002";
const sourceUrl =
  "https://transcripts.example.test/storage/v1/object/sign/recordings/test.wav?token=fixture";

test("transcript jobs accept only the configured bucket or the project's signed storage URLs", async () => {
  const { parseTranscriptJob } = await import("./transcriptProcessor.js");
  const job = { responseId, attemptId };
  assert.ok(parseTranscriptJob({ ...job, source: { url: sourceUrl } }));
  assert.ok(
    parseTranscriptJob({ ...job, source: { bucket: "test-recordings", objectKey: "test.wav" } }),
  );
  for (const source of [
    { url: "https://other.example.test/storage/v1/object/sign/recordings/test.wav" },
    { url: "https://transcripts.example.test/functions/v1/private" },
    {
      url: "https://user:secret@transcripts.example.test/storage/v1/object/sign/recordings/test.wav",
    },
    { bucket: "other-bucket", objectKey: "test.wav" },
    { bucket: "test-recordings", objectKey: "" },
    null,
  ])
    assert.equal(parseTranscriptJob({ ...job, source }), null);
  assert.equal(
    parseTranscriptJob({ ...job, responseId: "invalid", source: { url: sourceUrl } }),
    null,
  );
});

for (const withAudio of [true, false]) {
  test(`transcript-only media processing ${withAudio ? "uses Groq timestamps" : "handles recordings without audio"} and removes temporary media`, async () => {
    const [{ default: ffmpegPath }, { processRecordingTranscript }] = await Promise.all([
      import("ffmpeg-static"),
      import("./transcriptProcessor.js"),
    ]);
    const workDir = await mkdtemp(join(tmpdir(), "transcript-source-test-"));
    const sourcePath = join(workDir, withAudio ? "source.wav" : "source.mp4");
    const generated = spawnSync(
      ffmpegPath as unknown as string,
      [
        "-f",
        "lavfi",
        "-i",
        withAudio ? "sine=frequency=440:duration=0.4" : "color=c=white:s=16x16:d=0.4",
        "-y",
        sourcePath,
      ],
      { encoding: "utf8" },
    );
    const initialDirs = new Set(await readdir(tmpdir()));
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    try {
      assert.equal(generated.status, 0, generated.stderr);
      const media = await readFile(sourcePath);
      globalThis.fetch = async (input, init) => {
        if (String(input) === sourceUrl) return new Response(new Uint8Array(media));
        assert.equal(String(input), "https://api.groq.com/openai/v1/audio/transcriptions");
        providerCalls++;
        assert.ok(init?.body instanceof FormData);
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.body.get("response_format"), "verbose_json");
        assert.deepEqual(init.body.getAll("timestamp_granularities[]"), ["segment", "word"]);
        return Response.json({
          text: "Bonjour, café.",
          language: "french",
          duration: 0.4,
          segments: [{ start: 0.1, end: 0.35, text: "Bonjour, café." }],
          words: [
            { start: 0.1, end: 0.2, word: "Bonjour," },
            { start: 0.22, end: 0.35, word: "café." },
          ],
        });
      };
      const result = await processRecordingTranscript({
        responseId,
        attemptId,
        source: { url: sourceUrl },
      });
      assert.equal(result.responseId, responseId);
      assert.equal(result.provider, "groq");
      assert.equal(result.fullText, withAudio ? "Bonjour, café." : "");
      assert.equal(providerCalls, withAudio ? 1 : 0);
      if (withAudio) {
        assert.equal(result.language, "french");
        assert.equal(result.segments[0]?.startMs, 100);
        assert.equal(result.segments[0]?.endMs, 350);
        assert.equal(result.segments[0]?.words?.[1]?.word, "café.");
      } else assert.deepEqual(result.segments, []);
      assert.deepEqual(
        (await readdir(tmpdir())).filter(
          (name) => name.startsWith("recording-transcript-") && !initialDirs.has(name),
        ),
        [],
      );
    } finally {
      globalThis.fetch = originalFetch;
      await rm(workDir, { recursive: true, force: true });
    }
  });
}
