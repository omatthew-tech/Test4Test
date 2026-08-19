import { readFile, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";

import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { ResponseTranscript, TranscriptSegment, TranscriptWord } from "./types.js";

const ffmpegBinaryPath = ffmpegPath as unknown as string | null;
const MIN_CHUNK_SECONDS = 30;

if (ffmpegBinaryPath) {
  ffmpeg.setFfmpegPath(ffmpegBinaryPath);
}
ffmpeg.setFfprobePath(ffprobeStatic.path);

interface GroqWord {
  word?: unknown;
  start?: unknown;
  end?: unknown;
}

interface GroqSegment {
  id?: unknown;
  start?: unknown;
  end?: unknown;
  text?: unknown;
  avg_logprob?: unknown;
  no_speech_prob?: unknown;
  compression_ratio?: unknown;
  words?: GroqWord[];
}

interface GroqTranscriptionResponse {
  text?: unknown;
  language?: unknown;
  duration?: unknown;
  segments?: GroqSegment[];
  words?: GroqWord[];
  error?: {
    message?: unknown;
  };
}

interface AudioProbe {
  hasAudio: boolean;
  durationSeconds: number;
}

interface NormalizedChunk {
  text: string;
  language: string | null;
  segments: Array<Omit<TranscriptSegment, "segmentIndex">>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function secondsToMs(value: unknown, offsetMs: number) {
  const seconds = numberOrNull(value) ?? 0;
  return Math.max(0, Math.round(seconds * 1000) + offsetMs);
}

function uniquePath(workDir: string, responseId: string, label: string) {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return join(workDir, `${responseId}-${label}-${token}.flac`);
}

function probeAudio(input: string): Promise<AudioProbe> {
  return new Promise((resolve, reject) => {
    ffmpeg(input).ffprobe((err, data) => {
      if (err) {
        reject(err);
        return;
      }

      const hasAudio = (data.streams ?? []).some((stream) => stream.codec_type === "audio");
      const duration = data.format?.duration;

      resolve({
        hasAudio,
        durationSeconds: typeof duration === "number" && Number.isFinite(duration) ? duration : 0,
      });
    });
  });
}

function extractAudioToFlac(
  input: string,
  output: string,
  options: { startSeconds?: number; durationSeconds?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(input);

    if (typeof options.startSeconds === "number" && options.startSeconds > 0) {
      command = command.seekInput(options.startSeconds);
    }

    command
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("flac")
      .format("flac")
      .outputOptions([
        "-map",
        "0:a:0",
        ...(typeof options.durationSeconds === "number" && options.durationSeconds > 0
          ? ["-t", String(options.durationSeconds)]
          : []),
      ])
      .output(output)
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .run();
  });
}

async function removeFile(path: string) {
  await unlink(path).catch(() => undefined);
}

async function callGroqTranscription(audioPath: string): Promise<GroqTranscriptionResponse> {
  if (!config.transcription.apiKey) {
    throw new Error("Missing GROQ_API_KEY for report transcription.");
  }

  const body = new FormData();
  const buffer = await readFile(audioPath);
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/flac" });

  body.append("file", blob, basename(audioPath));
  body.append("model", config.transcription.model);
  body.append("response_format", "verbose_json");
  body.append("temperature", "0");
  body.append("timestamp_granularities[]", "segment");
  body.append("timestamp_granularities[]", "word");

  if (config.transcription.language) {
    body.append("language", config.transcription.language);
  }

  if (config.transcription.prompt) {
    body.append("prompt", config.transcription.prompt);
  }

  const response = await fetch(config.transcription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.transcription.apiKey}`,
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as GroqTranscriptionResponse | null;

  if (!response.ok || !payload) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `Groq transcription failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}

function normalizeWords(
  words: GroqWord[] | undefined,
  offsetMs: number,
  startMs: number,
  endMs: number,
): TranscriptWord[] | undefined {
  const normalized = (words ?? [])
    .map((word) => ({
      word: typeof word.word === "string" ? word.word : "",
      startMs: secondsToMs(word.start, offsetMs),
      endMs: secondsToMs(word.end, offsetMs),
    }))
    .filter((word) => word.word.trim() && word.endMs >= word.startMs)
    .filter((word) => word.startMs < endMs && word.endMs > startMs);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeGroqChunk(payload: GroqTranscriptionResponse, offsetMs: number): NormalizedChunk {
  const allWords = Array.isArray(payload.words) ? payload.words : [];
  const language =
    typeof payload.language === "string" && payload.language.trim()
      ? payload.language.trim()
      : null;
  const segments = (Array.isArray(payload.segments) ? payload.segments : [])
    .map((segment) => {
      const startMs = secondsToMs(segment.start, offsetMs);
      const endMs = Math.max(startMs, secondsToMs(segment.end, offsetMs));
      const text = typeof segment.text === "string" ? segment.text.trim() : "";
      const segmentWords = Array.isArray(segment.words) ? segment.words : allWords;

      return {
        startMs,
        endMs,
        text,
        words: normalizeWords(segmentWords, offsetMs, startMs, endMs),
        avgLogprob: numberOrNull(segment.avg_logprob),
        noSpeechProb: numberOrNull(segment.no_speech_prob),
        compressionRatio: numberOrNull(segment.compression_ratio),
      };
    })
    .filter((segment) => segment.text && segment.endMs >= segment.startMs);

  const text =
    typeof payload.text === "string" && payload.text.trim()
      ? payload.text.trim()
      : segments
          .map((segment) => segment.text)
          .join(" ")
          .trim();

  return { text, language, segments };
}

async function transcribeAudioPath(audioPath: string, offsetMs: number): Promise<NormalizedChunk> {
  const payload = await callGroqTranscription(audioPath);
  return normalizeGroqChunk(payload, offsetMs);
}

async function transcribeChunk(
  input: string,
  workDir: string,
  responseId: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<NormalizedChunk[]> {
  const chunkPath = uniquePath(workDir, responseId, `chunk-${Math.round(startSeconds * 1000)}`);

  await extractAudioToFlac(input, chunkPath, { startSeconds, durationSeconds });

  try {
    const stats = await stat(chunkPath);

    if (stats.size === 0) {
      return [];
    }

    if (stats.size > config.transcription.maxUploadBytes && durationSeconds > MIN_CHUNK_SECONDS) {
      await removeFile(chunkPath);
      const half = durationSeconds / 2;
      const first = await transcribeChunk(input, workDir, responseId, startSeconds, half);
      const second = await transcribeChunk(input, workDir, responseId, startSeconds + half, half);
      return [...first, ...second];
    }

    if (stats.size > config.transcription.maxUploadBytes) {
      throw new Error("A transcription audio chunk is too large for Groq after splitting.");
    }

    return [await transcribeAudioPath(chunkPath, Math.round(startSeconds * 1000))];
  } finally {
    await removeFile(chunkPath);
  }
}

function combineChunks(
  responseId: string,
  durationMs: number | null,
  chunks: NormalizedChunk[],
): ResponseTranscript {
  const segments = chunks
    .flatMap((chunk) => chunk.segments)
    .sort((first, second) => first.startMs - second.startMs || first.endMs - second.endMs)
    .map((segment, index) => ({
      ...segment,
      segmentIndex: index,
    }));
  const text = chunks
    .map((chunk) => chunk.text)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const language =
    (chunks.find((chunk) => chunk.language)?.language ?? config.transcription.language) || null;

  return {
    responseId,
    provider: config.transcription.provider,
    model: config.transcription.model,
    language,
    durationMs,
    fullText: text,
    segments,
  };
}

export async function transcribeRecording(
  input: string,
  workDir: string,
  responseId: string,
): Promise<ResponseTranscript> {
  const audio = await probeAudio(input);
  const durationMs = audio.durationSeconds > 0 ? Math.round(audio.durationSeconds * 1000) : null;

  if (!audio.hasAudio) {
    logger.info("Recording has no audio stream; storing empty transcript", { responseId });
    return combineChunks(responseId, durationMs, []);
  }

  const fullAudioPath = uniquePath(workDir, responseId, "full");
  await extractAudioToFlac(input, fullAudioPath);

  try {
    const stats = await stat(fullAudioPath);

    if (stats.size === 0) {
      return combineChunks(responseId, durationMs, []);
    }

    if (stats.size <= config.transcription.maxUploadBytes) {
      const chunk = await transcribeAudioPath(fullAudioPath, 0);
      return combineChunks(responseId, durationMs, [chunk]);
    }
  } finally {
    await removeFile(fullAudioPath);
  }

  const chunkSeconds = Math.max(MIN_CHUNK_SECONDS, config.transcription.chunkSeconds);
  const durationSeconds = Math.max(audio.durationSeconds, chunkSeconds);
  const chunks: NormalizedChunk[] = [];

  for (let startSeconds = 0; startSeconds < durationSeconds; startSeconds += chunkSeconds) {
    const currentDuration = Math.min(chunkSeconds, durationSeconds - startSeconds);
    chunks.push(
      ...(await transcribeChunk(input, workDir, responseId, startSeconds, currentDuration)),
    );
  }

  return combineChunks(responseId, durationMs, chunks);
}
