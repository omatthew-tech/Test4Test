import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

Object.assign(process.env, {
  CLOUDFLARE_ACCOUNT_ID: "test",
  CLOUDFLARE_ACCESS_KEY_ID: "test",
  CLOUDFLARE_SECRET_ACCESS_KEY: "test",
  CLOUDFLARE_BUCKET_NAME: "frames",
  CLOUDFLARE_SOURCE_BUCKET_NAME: "recordings",
  CLOUDFLARE_ENDPOINT: "https://example.invalid",
  WORKER_SHARED_SECRET: "test",
  CLIP_COMPLETION_WEBHOOK_URL: "https://project.example/functions/v1/complete-recording-clip",
});
const base = {
  clipId: "40000000-0000-4000-8000-000000000001",
  attemptId: "50000000-0000-4000-8000-000000000001",
  startMs: 1200,
  endMs: 2600,
};
test("preserves a high-resolution VP9 screen recording with bounded export buffering", async () => {
  const { default: ffmpeg } = await import("ffmpeg-static");
  const { exportClipFile, probeClip } = await import("./clipProcessor.js");
  const directory = await mkdtemp(join(tmpdir(), "clip-screen-export-test-"));
  const source = join(directory, "screen.webm");
  const output = join(directory, "clip.mp4");
  try {
    const generated = spawnSync(
      ffmpeg as unknown as string,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=2880x1800:r=30:d=2",
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        "-cpu-used",
        "8",
        "-threads",
        "1",
        "-live",
        "1",
        "-y",
        source,
      ],
      { encoding: "utf8" },
    );
    assert.equal(generated.status, 0, generated.stderr);
    await exportClipFile(source, output, 330, 1630);
    const info = await probeClip(output);
    const video = info.streams.find((stream) => stream.codec_type === "video");
    assert.equal(video?.width, 2880);
    assert.equal(video?.height, 1800);
    assert.equal(video?.codec_name, "h264");
    assert.ok(Math.abs(Number(info.format.duration) - 1.3) < 0.15);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("clip jobs validate ranges and reject arbitrary URLs and buckets", async () => {
  const { parseClipJob } = await import("./clipProcessor.js");
  const source = { bucket: "recordings", objectKey: "draft/video.webm" };
  assert.ok(parseClipJob({ ...base, source }));
  for (const invalid of [
    { startMs: -1 },
    { endMs: 1200 },
    { startMs: NaN },
    { endMs: Infinity },
    { clipId: "invalid" },
    { source: { url: "http://127.0.0.1/secret" } },
    { source: { bucket: "other", objectKey: "source" } },
    { source: { url: "https://project.example/private" } },
  ])
    assert.equal(parseClipJob({ ...base, source, ...invalid }), null);
});
for (const extension of ["webm", "mp4", "mov"])
  for (const audio of [true, false]) {
    test(`exports an accurate ${extension} clip ${audio ? "with audio" : "without audio"}`, async () => {
      const { default: ffmpeg } = await import("ffmpeg-static");
      const { exportClipFile, probeClip } = await import("./clipProcessor.js");
      const directory = await mkdtemp(join(tmpdir(), "clip-export-test-"));
      const source = join(directory, `source.${extension}`),
        output = join(directory, "clip.mp4");
      try {
        // The first second is red and the remaining seconds blue. A non-keyframe cut must omit red.
        const args = [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=red:s=160x90:r=20:d=1",
          "-f",
          "lavfi",
          "-i",
          "color=blue:s=160x90:r=20:d=2",
        ];
        if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=3");
        args.push("-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]");
        if (audio) args.push("-map", "2:a", "-c:a", extension === "webm" ? "libopus" : "aac");
        args.push(
          "-c:v",
          extension === "webm" ? "libvpx-vp9" : "libx264",
          "-g",
          "100",
          "-y",
          source,
        );
        // Browser MediaRecorder often omits WebM duration and seek cues.
        if (extension === "webm") args.splice(args.length - 1, 0, "-live", "1");
        const generated = spawnSync(ffmpeg as unknown as string, args, { encoding: "utf8" });
        assert.equal(generated.status, 0, generated.stderr);
        await exportClipFile(source, output, base.startMs, base.endMs);
        const info = await probeClip(output);
        assert.ok(Math.abs(Number(info.format.duration) - 1.4) < 0.15);
        assert.equal(
          info.streams.find((stream) => stream.codec_type === "video")?.codec_name,
          "h264",
        );
        assert.equal(
          info.streams.some((stream) => stream.codec_type === "audio"),
          audio,
        );
        if (audio)
          assert.equal(
            info.streams.find((stream) => stream.codec_type === "audio")?.codec_name,
            "aac",
          );
        const frame = spawnSync(ffmpeg as unknown as string, [
          "-v",
          "error",
          "-i",
          output,
          "-frames:v",
          "1",
          "-vf",
          "scale=1:1",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ]);
        assert.ok(
          frame.stdout[2]! > 180 && frame.stdout[0]! < 50,
          "The clip must start on blue, excluding the earlier red footage",
        );
        const bytes = await readFile(output);
        assert.ok(
          bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat")),
          "MP4 must support progressive playback",
        );
        await assert.rejects(exportClipFile(source, output, 1000, 10000), /duration|completely/);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
