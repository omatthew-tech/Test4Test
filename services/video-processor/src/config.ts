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
    /** When set, job endpoints require a matching `x-worker-secret` header. */
    sharedSecret: process.env.WORKER_SHARED_SECRET?.trim() ?? "",
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

  completionWebhookUrl: process.env.COMPLETION_WEBHOOK_URL?.trim() ?? "",
} as const;

export type AppConfig = typeof config;
