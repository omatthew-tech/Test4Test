import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { config } from "./config.js";
import { r2 } from "./r2Client.js";

export interface ClipJob {
  clipId: string;
  attemptId: string;
  startMs: number;
  endMs: number;
  source:
    | { bucket: string; objectKey: string; url?: never }
    | { url: string; bucket?: never; objectKey?: never };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const run = promisify(execFile);
export const clipOutputPath = (job: ClipJob) =>
  `recording-clips/${job.clipId}/${job.attemptId}.mp4`;

export function parseClipJob(value: unknown): ClipJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as ClipJob;
  if (
    !uuid.test(job.clipId) ||
    !uuid.test(job.attemptId) ||
    !Number.isSafeInteger(job.startMs) ||
    !Number.isSafeInteger(job.endMs) ||
    job.startMs < 0 ||
    job.endMs - job.startMs < 100 ||
    job.endMs > 86400000 ||
    !job.source
  )
    return null;
  let source: ClipJob["source"];
  if (typeof job.source.url === "string") {
    try {
      const url = new URL(job.source.url),
        callback = new URL(config.clips.completionWebhookUrl);
      if (
        url.origin !== callback.origin ||
        !url.pathname.startsWith("/storage/v1/object/sign/") ||
        url.username ||
        url.password ||
        (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      )
        return null;
      source = { url: url.href };
    } catch {
      return null;
    }
  } else {
    if (
      job.source.bucket !== config.r2.sourceBucketName ||
      typeof job.source.objectKey !== "string" ||
      !job.source.objectKey ||
      job.source.objectKey.startsWith("recording-clips/")
    )
      return null;
    source = { bucket: job.source.bucket, objectKey: job.source.objectKey };
  }
  return {
    clipId: job.clipId,
    attemptId: job.attemptId,
    startMs: job.startMs,
    endMs: job.endMs,
    source,
  };
}

export async function probeClip(path: string, signal?: AbortSignal) {
  const { stdout } = await run(
    ffprobeStatic.path,
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      path,
    ],
    { signal, timeout: 60_000, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout) as {
    format: { duration?: string };
    streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>;
  };
}

export async function exportClipFile(
  sourcePath: string,
  outputPath: string,
  startMs: number,
  endMs: number,
  signal?: AbortSignal,
) {
  if (
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    startMs < 0 ||
    endMs - startMs < 100 ||
    endMs > 86400000
  )
    throw new Error("Invalid clip range.");
  const source = await probeClip(sourcePath, signal);
  if (!source.streams.some((stream) => stream.codec_type === "video"))
    throw new Error("Recording has no video.");
  const sourceDuration = Number(source.format.duration);
  if (Number.isFinite(sourceDuration) && endMs > sourceDuration * 1000 + 100)
    throw new Error("Clip exceeds recording duration.");
  const duration = (endMs - startMs) / 1000;
  await run(
    ffmpegPath as unknown as string,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm",
      "-ss",
      String(startMs / 1000),
      "-i",
      sourcePath,
      "-t",
      String(duration),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-fs",
      String(2 * 1024 * 1024 * 1024),
      outputPath,
    ],
    { signal, timeout: 600_000, maxBuffer: 1024 * 1024 },
  );
  const output = await probeClip(outputPath, signal);
  const outputDuration = Number(output.format.duration);
  if (
    !output.streams.some((stream) => stream.codec_type === "video") ||
    !Number.isFinite(outputDuration) ||
    outputDuration <= 0 ||
    Math.abs(outputDuration - duration) > 0.25
  )
    throw new Error("The selected range could not be exported completely.");
}

export async function processRecordingClip(job: ClipJob) {
  const directory = await mkdtemp(join(tmpdir(), "recording-clip-"));
  const sourcePath = join(directory, "source.video"),
    outputPath = join(directory, "clip.mp4");
  const signal = AbortSignal.timeout(15 * 60_000);
  try {
    let stream: Readable;
    if (job.source.url) {
      const response = await fetch(job.source.url, { signal, redirect: "error" });
      if (!response.ok || !response.body) throw new Error("Recording unavailable.");
      stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    } else {
      const response = await r2.send(
        new GetObjectCommand({ Bucket: job.source.bucket, Key: job.source.objectKey }),
        { abortSignal: signal },
      );
      if (!response.Body) throw new Error("Recording unavailable.");
      stream = response.Body as Readable;
    }
    let bytes = 0;
    const bound = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > 1024 * 1024 * 1024 ? new Error("Recording exceeds upload limit.") : null,
          chunk,
        );
      },
    });
    await pipeline(stream, bound, createWriteStream(sourcePath), { signal });
    await exportClipFile(sourcePath, outputPath, job.startMs, job.endMs, signal);
    const { size } = await stat(outputPath);
    await r2.send(
      new PutObjectCommand({
        Bucket: config.r2.sourceBucketName,
        Key: clipOutputPath(job),
        Body: createReadStream(outputPath),
        ContentLength: size,
        ContentType: "video/mp4",
        CacheControl: "private, max-age=300",
      }),
      { abortSignal: signal },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function deleteClipOutput(job: ClipJob) {
  await r2.send(
    new DeleteObjectCommand({ Bucket: config.r2.sourceBucketName, Key: clipOutputPath(job) }),
    { abortSignal: AbortSignal.timeout(30_000) },
  );
}
