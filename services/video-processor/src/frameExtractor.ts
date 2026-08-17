import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";

import { config } from "./config.js";
import { logger } from "./logger.js";

const ffmpegBinaryPath = ffmpegPath as unknown as string | null;

if (ffmpegBinaryPath) {
  ffmpeg.setFfmpegPath(ffmpegBinaryPath);
}
ffmpeg.setFfprobePath(ffprobeStatic.path);

const NULL_SINK = process.platform === "win32" ? "NUL" : "/dev/null";

export interface CandidateFrame {
  /** EXACT presentation timestamp within the source video, in milliseconds. */
  timestampMs: number;
  /** Encoded screenshot bytes (WebP). */
  buffer: Buffer;
  width: number;
  height: number;
  /** 64-bit average perceptual hash, as a 16-char hex string. */
  perceptualHash: string;
}

export interface RecordingThumbnailFrame {
  timestampMs: number;
  durationMs: number;
  buffer: Buffer;
  width: number;
  height: number;
}

function positiveDuration(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function selectProbedDurationSeconds(
  formatDuration: unknown,
  streamDurations: unknown[],
) {
  return Math.max(positiveDuration(formatDuration), ...streamDurations.map(positiveDuration));
}

function scanPacketDurationSeconds(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let durationSeconds = 0;

    ffmpeg(input)
      .outputOptions(["-map", "0:v:0", "-c", "copy", "-f", "null"])
      .output(NULL_SINK)
      .on("stderr", (line: string) => {
        const match = line.match(/time=\s*([0-9]+):([0-9]+):([0-9]+(?:\.[0-9]+)?)/);
        if (!match?.[1] || !match[2] || !match[3]) {
          return;
        }

        const seconds =
          Number.parseInt(match[1], 10) * 3600 +
          Number.parseInt(match[2], 10) * 60 +
          Number.parseFloat(match[3]);
        durationSeconds = Math.max(durationSeconds, seconds);
      })
      .on("end", () => resolve(durationSeconds))
      .on("error", reject)
      .run();
  });
}

/** Probe total duration (seconds), falling back to a fast packet scan for MediaRecorder WebM. */
export async function probeDurationSeconds(input: string): Promise<number> {
  const probed = await new Promise<number>((resolve, reject) => {
    ffmpeg(input).ffprobe((err, data) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(
        selectProbedDurationSeconds(
          data.format?.duration,
          (data.streams ?? []).map((stream) => stream.duration),
        ),
      );
    });
  });

  return probed > 0 ? probed : scanPacketDurationSeconds(input);
}

/**
 * Pass 1 — detect candidate timestamps (in seconds).
 *
 * We run ffmpeg's scene-change detector together with the `showinfo` filter and
 * parse `pts_time:` from stderr. `showinfo` only prints for frames that pass the
 * `select` filter, so we get the EXACT presentation timestamp of each scene
 * change. t=0 is always included so the opening screen is captured.
 */
export function detectSceneTimestamps(input: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const timestamps: number[] = [0];
    const sceneThreshold = config.frames.sceneThreshold;
    const filters: string[] = [];

    if (config.frames.analysisFps > 0) {
      filters.push(`fps=${config.frames.analysisFps}`);
    }

    if (config.frames.analysisWidth > 0) {
      filters.push(`scale=${config.frames.analysisWidth}:-1:flags=fast_bilinear`);
    }

    filters.push(`select='gt(scene,${sceneThreshold})'`, "showinfo");

    ffmpeg(input)
      .outputOptions([
        "-vf",
        filters.join(","),
        // Variable frame rate so only selected frames are emitted/measured.
        "-vsync",
        "vfr",
        "-f",
        "null",
      ])
      .output(NULL_SINK)
      .on("stderr", (line: string) => {
        const match = line.match(/pts_time:([0-9]+(?:\.[0-9]+)?)/);
        if (match?.[1]) {
          timestamps.push(Number.parseFloat(match[1]));
        }
      })
      .on("end", () => resolve(normalizeTimestamps(timestamps)))
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Detect scene changes after a known offset. Seeking before the input keeps the
 * analysis bounded to the second half of the recording. FFmpeg builds differ
 * in whether showinfo reports source-relative or seek-relative timestamps, so
 * small timestamps are normalized back onto the source timeline.
 */
export function detectSceneTimestampsAfter(input: string, startSeconds: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const timestamps: number[] = [];
    const filters: string[] = [];

    if (config.frames.analysisFps > 0) {
      filters.push(`fps=${config.frames.analysisFps}`);
    }
    if (config.frames.analysisWidth > 0) {
      filters.push(`scale=${config.frames.analysisWidth}:-1:flags=fast_bilinear`);
    }
    filters.push(`select='gt(scene,${config.frames.sceneThreshold})'`, "showinfo");

    ffmpeg(input)
      // Thumbnail analysis only needs scene-bearing keyframes. This avoids
      // decoding every intervening frame on long, high-resolution recordings.
      .inputOptions(["-skip_frame", "nokey"])
      .seekInput(Math.max(0, startSeconds))
      .outputOptions(["-vf", filters.join(","), "-vsync", "vfr", "-f", "null"])
      .output(NULL_SINK)
      .on("stderr", (line: string) => {
        const match = line.match(/pts_time:([0-9]+(?:\.[0-9]+)?)/);
        if (!match?.[1]) {
          return;
        }

        const parsed = Number.parseFloat(match[1]);
        const sourceTimestamp = parsed + 0.001 < startSeconds ? parsed + startSeconds : parsed;
        timestamps.push(sourceTimestamp);
      })
      .on("end", () => resolve([...new Set(timestamps)].sort((a, b) => a - b)))
      .on("error", reject)
      .run();
  });
}

export function selectRecordingThumbnailTimestampSeconds(
  durationSeconds: number,
  sceneTimestamps: number[],
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Recording duration could not be determined.");
  }

  const midpoint = durationSeconds * 0.5;
  const firstLaterScene = sceneTimestamps
    .filter(
      (timestamp) =>
        Number.isFinite(timestamp) && timestamp >= midpoint && timestamp <= durationSeconds,
    )
    .sort((first, second) => first - second)[0];

  return firstLaterScene ?? Math.min(durationSeconds, durationSeconds * 0.55);
}

/** Regular interval samples across the video (e.g. every 30s on a 6-min recording). */
function buildIntervalTimestamps(durationSeconds: number, intervalSeconds: number): number[] {
  if (intervalSeconds <= 0 || durationSeconds <= 0) {
    return [];
  }

  const timestamps: number[] = [];
  for (let time = intervalSeconds; time < durationSeconds; time += intervalSeconds) {
    timestamps.push(time);
  }

  return timestamps;
}

/** Sort, clamp, and enforce a minimum gap between consecutive timestamps. */
function normalizeTimestamps(rawSeconds: number[]): number[] {
  const minGap = config.frames.minGapSeconds;
  const sorted = [
    ...new Set(rawSeconds.filter((value) => Number.isFinite(value) && value >= 0)),
  ].sort((a, b) => a - b);

  const spaced: number[] = [];
  for (const value of sorted) {
    const last = spaced[spaced.length - 1];
    if (last === undefined || value - last >= minGap) {
      spaced.push(value);
    }
  }

  return spaced.slice(0, config.frames.maxPerVideo);
}

/**
 * Pass 2 — extract one exact frame at the given timestamp.
 *
 * We seek with `-ss <seconds>` as an INPUT option (fast + accurate for a single
 * frame) and grab exactly one frame. Because we explicitly seek to a known
 * offset, the returned screenshot's timestamp is exact — we do not rely on
 * ffmpeg's output numbering.
 */
function extractRawFrameAt(input: string, timestampSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const stream = ffmpeg(input)
      .seekInput(timestampSeconds)
      .frames(1)
      .outputOptions(["-f", "image2", "-vcodec", "png"])
      .on("error", (err) => reject(err))
      .pipe();

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err: Error) => reject(err));
  });
}

/** Extract the single Analytics preview frame without running report de-duplication. */
export async function extractRecordingThumbnail(
  input: string,
  knownDurationSeconds?: number,
): Promise<RecordingThumbnailFrame> {
  const durationSeconds =
    Number.isFinite(knownDurationSeconds) && (knownDurationSeconds ?? 0) > 0
      ? (knownDurationSeconds as number)
      : await probeDurationSeconds(input);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Recording duration could not be determined.");
  }

  const midpoint = durationSeconds * 0.5;
  const sceneTimestamps = await detectSceneTimestampsAfter(input, midpoint);
  const timestampSeconds = selectRecordingThumbnailTimestampSeconds(
    durationSeconds,
    sceneTimestamps,
  );
  const rawFrame = await extractRawFrameAt(input, timestampSeconds);

  if (rawFrame.length === 0) {
    throw new Error("FFmpeg did not return a thumbnail frame.");
  }

  const webp = await sharp(rawFrame)
    .resize({ width: 960, withoutEnlargement: false })
    .webp({ quality: 72, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    timestampMs: Math.round(timestampSeconds * 1000),
    durationMs: Math.round(durationSeconds * 1000),
    buffer: webp.data,
    width: webp.info.width,
    height: webp.info.height,
  };
}

/**
 * Compute a 64-bit average hash (aHash): downscale to 8x8 greyscale, then set a
 * bit per pixel based on whether it is brighter than the mean. Returned as a
 * 16-character hex string for compact storage.
 */
async function computeAverageHash(rawImage: Buffer): Promise<string> {
  const { data } = await sharp(rawImage)
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (const value of data) {
    sum += value;
  }
  const mean = sum / data.length;

  let hash = 0n;
  for (let i = 0; i < 64; i += 1) {
    hash <<= 1n;
    if ((data[i] ?? 0) >= mean) {
      hash |= 1n;
    }
  }

  return hash.toString(16).padStart(16, "0");
}

/** Hamming distance between two equal-length hex hash strings. */
export function hammingDistance(hashA: string, hashB: string): number {
  let diff = BigInt(`0x${hashA}`) ^ BigInt(`0x${hashB}`);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/**
 * Extract unique, timestamped screenshots from a single source video.
 *
 * Strategy:
 *   1. Detect scene-change timestamps (exact pts_time values).
 *   2. Seek to each timestamp and grab one frame.
 *   3. Drop near-duplicate frames using perceptual-hash Hamming distance so the
 *      result is a set of UNIQUE app-page screenshots.
 *   4. Re-encode kept frames to WebP at the configured width/quality.
 */
export async function extractUniqueFrames(input: string): Promise<CandidateFrame[]> {
  const durationSeconds = await probeDurationSeconds(input);
  const sceneTimestamps = await detectSceneTimestamps(input);
  const intervalTimestamps = buildIntervalTimestamps(
    durationSeconds,
    config.frames.sampleIntervalSeconds,
  );
  const timestamps = normalizeTimestamps([...sceneTimestamps, ...intervalTimestamps]);

  logger.info("Detected frame timestamps", {
    input,
    durationSeconds,
    analysisFps: config.frames.analysisFps,
    analysisWidth: config.frames.analysisWidth,
    sceneCandidateCount: sceneTimestamps.length,
    intervalCandidateCount: intervalTimestamps.length,
    mergedCandidateCount: timestamps.length,
  });

  const kept: CandidateFrame[] = [];

  for (const timestampSeconds of timestamps) {
    let rawFrame: Buffer;
    try {
      rawFrame = await extractRawFrameAt(input, timestampSeconds);
    } catch (error) {
      logger.warn("Failed to extract frame", {
        input,
        timestampSeconds,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (rawFrame.length === 0) {
      continue;
    }

    const perceptualHash = await computeAverageHash(rawFrame);

    const isDuplicate = kept.some(
      (frame) =>
        hammingDistance(frame.perceptualHash, perceptualHash) <= config.frames.hammingThreshold,
    );

    if (isDuplicate) {
      continue;
    }

    const webp = await sharp(rawFrame)
      .resize({ width: config.frames.outputWidth, withoutEnlargement: true })
      .webp({ quality: config.frames.outputQuality })
      .toBuffer({ resolveWithObject: true });

    kept.push({
      timestampMs: Math.round(timestampSeconds * 1000),
      buffer: webp.data,
      width: webp.info.width,
      height: webp.info.height,
      perceptualHash,
    });
  }

  logger.info("Extracted unique frames", { input, uniqueCount: kept.length });
  return kept;
}
