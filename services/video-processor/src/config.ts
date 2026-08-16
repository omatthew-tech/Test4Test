import "dotenv/config";

/**
 * Centralized, validated configuration.
 *
 * All Cloudflare R2 credentials are read STRICTLY from environment variables.
 * Nothing is hardcoded. Missing required values fail fast at startup so the
 * service never runs with a half-configured S3 client.
 */

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and fill it in (do not hardcode secrets).`,
    );
  }

  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const cloudflareBucketName = requireEnv("CLOUDFLARE_BUCKET_NAME");

export const config = {
  http: {
    port: numberEnv("PORT", 8787),
    /** Protected job and asset endpoints require this shared secret. */
    sharedSecret: requireEnv("WORKER_SHARED_SECRET"),
  },

  r2: {
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    accessKeyId: requireEnv("CLOUDFLARE_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("CLOUDFLARE_SECRET_ACCESS_KEY"),
    endpoint: requireEnv("CLOUDFLARE_ENDPOINT"),
    /** Destination bucket for the generated screenshot frames. */
    bucketName: cloudflareBucketName,
    /** Bucket that holds the source recordings (defaults to the frames bucket). */
    sourceBucketName: optionalEnv("CLOUDFLARE_SOURCE_BUCKET_NAME", cloudflareBucketName),
  },

  frames: {
    sceneThreshold: numberEnv("FRAME_SCENE_THRESHOLD", 0.3),
    minGapSeconds: numberEnv("FRAME_MIN_GAP_SECONDS", 0.75),
    maxPerVideo: numberEnv("FRAME_MAX_PER_VIDEO", 60),
    hammingThreshold: numberEnv("FRAME_HAMMING_THRESHOLD", 6),
    /** Downsample the scene-detection pass so reports do not spend minutes decoding full-res video. */
    analysisFps: numberEnv("FRAME_ANALYSIS_FPS", 2),
    analysisWidth: numberEnv("FRAME_ANALYSIS_WIDTH", 480),
    /** Fixed-interval samples (seconds). 0 disables. Supplements scene detection for long videos. */
    sampleIntervalSeconds: numberEnv("FRAME_SAMPLE_INTERVAL_SECONDS", 0),
    outputWidth: numberEnv("FRAME_OUTPUT_WIDTH", 1280),
    outputQuality: numberEnv("FRAME_OUTPUT_QUALITY", 80),
  },

  transcription: {
    provider: "groq",
    apiKey: process.env.GROQ_API_KEY?.trim() ?? "",
    model: optionalEnv("GROQ_TRANSCRIPTION_MODEL", "whisper-large-v3-turbo"),
    language: process.env.GROQ_TRANSCRIPTION_LANGUAGE?.trim() ?? "",
    prompt: process.env.GROQ_TRANSCRIPTION_PROMPT?.trim() ?? "",
    endpoint: optionalEnv(
      "GROQ_TRANSCRIPTION_ENDPOINT",
      "https://api.groq.com/openai/v1/audio/transcriptions",
    ),
    /** Keep direct uploads comfortably below Groq's documented attachment limits. */
    maxUploadBytes: numberEnv("GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES", 20 * 1024 * 1024),
    chunkSeconds: numberEnv("GROQ_TRANSCRIPTION_CHUNK_SECONDS", 600),
  },

  completionWebhookUrl: process.env.COMPLETION_WEBHOOK_URL?.trim() ?? "",
  thumbnails: {
    generationVersion: optionalEnv("THUMBNAIL_GENERATION_VERSION", "scene-after-half-v1"),
    completionWebhookUrl: process.env.THUMBNAIL_COMPLETION_WEBHOOK_URL?.trim() ?? "",
    queueConcurrency: numberEnv("THUMBNAIL_JOB_CONCURRENCY", 1),
    queueMaxPending: numberEnv("THUMBNAIL_QUEUE_MAX_PENDING", 32),
    maxBatchSize: numberEnv("THUMBNAIL_MAX_BATCH_SIZE", 16),
  },
} as const;

export type AppConfig = typeof config;
