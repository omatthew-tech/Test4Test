import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function configureTestEnvironment() {
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_ACCESS_KEY_ID = "test-key";
  process.env.CLOUDFLARE_SECRET_ACCESS_KEY = "test-secret";
  process.env.CLOUDFLARE_BUCKET_NAME = "usability-test-screenshots";
  process.env.CLOUDFLARE_SOURCE_BUCKET_NAME = "test-response-recordings";
  process.env.CLOUDFLARE_ENDPOINT = "https://example.invalid";
  process.env.WORKER_SHARED_SECRET = "test-worker-secret";
  process.env.FRAME_SCENE_THRESHOLD = "0.06";
}

configureTestEnvironment();

test("selects the first detected scene at or after halfway", async () => {
  const { selectRecordingThumbnailTimestampSeconds } = await import("./frameExtractor.js");
  assert.equal(selectRecordingThumbnailTimestampSeconds(100, [4, 49.9, 63, 82]), 63);
});

test("sorts multiple candidate scenes before selecting", async () => {
  const { selectRecordingThumbnailTimestampSeconds } = await import("./frameExtractor.js");
  assert.equal(selectRecordingThumbnailTimestampSeconds(80, [72, 41, 55]), 41);
});

test("falls back to 55 percent when no later scene exists", async () => {
  const { selectRecordingThumbnailTimestampSeconds } = await import("./frameExtractor.js");
  assert.ok(Math.abs(selectRecordingThumbnailTimestampSeconds(200, [4, 80, 99]) - 110) < 0.001);
});

test("rejects recordings without a usable duration", async () => {
  const { selectRecordingThumbnailTimestampSeconds } = await import("./frameExtractor.js");
  assert.throws(() => selectRecordingThumbnailTimestampSeconds(0, []));
});

test("extracts a 960px WebP from a short recording and rejects corrupt video", async () => {
  const [{ default: ffmpegPath }, { default: sharp }, { extractRecordingThumbnail }] =
    await Promise.all([import("ffmpeg-static"), import("sharp"), import("./frameExtractor.js")]);
  assert.ok(ffmpegPath);

  const workDir = await mkdtemp(join(tmpdir(), "recording-thumbnail-test-"));
  const shortVideo = join(workDir, "short.mp4");
  const corruptVideo = join(workDir, "corrupt.webm");

  try {
    const generated = spawnSync(
      ffmpegPath as unknown as string,
      [
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=10:duration=0.4",
        "-pix_fmt",
        "yuv420p",
        "-y",
        shortVideo,
      ],
      { encoding: "utf8" },
    );
    assert.equal(generated.status, 0, generated.stderr);

    const frame = await extractRecordingThumbnail(shortVideo);
    const metadata = await sharp(frame.buffer).metadata();
    assert.equal(frame.width, 960);
    assert.equal(frame.height, 540);
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 960);
    assert.ok(frame.timestampMs >= Math.floor(frame.durationMs * 0.5));

    await writeFile(corruptVideo, "not a video", "utf8");
    await assert.rejects(extractRecordingThumbnail(corruptVideo));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
