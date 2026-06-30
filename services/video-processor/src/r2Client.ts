import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * S3 client configured for Cloudflare R2.
 *
 * Cloudflare R2 is S3-compatible, so we use the standard AWS SDK v3 client with:
 *  - region "auto" (R2 ignores region but the SDK requires one)
 *  - the account-scoped R2 endpoint
 *  - credentials sourced exclusively from environment variables (see config.ts)
 *
 * No keys are ever hardcoded here.
 */
export const r2 = new S3Client({
  region: "auto",
  endpoint: config.r2.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

function formatR2Error(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = error as Error & {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  const parts = [details.name ?? "Error", details.message].filter(Boolean);
  const code = details.Code ?? details.name;
  const status = details.$metadata?.httpStatusCode;

  if (code && !parts[0]?.includes(code)) {
    parts.unshift(code);
  }

  if (status) {
    parts.push(`HTTP ${status}`);
  }

  return parts.join(": ");
}

/** Verify the destination bucket is reachable with the supplied credentials. */
export async function assertBucketReachable(): Promise<void> {
  try {
    await r2.send(new HeadBucketCommand({ Bucket: config.r2.bucketName }));
  } catch (error) {
    throw new Error(
      `R2 HeadBucket failed for "${config.r2.bucketName}" at ${config.r2.endpoint} — ${formatR2Error(error)}`,
    );
  }
}

/**
 * Download a source object from R2 to a local file path, streaming to avoid
 * buffering large videos in memory.
 */
export async function downloadObjectToFile(params: {
  bucket: string;
  key: string;
  destPath: string;
}): Promise<void> {
  const { bucket, key, destPath } = params;

  const response = await r2.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!response.Body) {
    throw new Error(`Empty body for r2://${bucket}/${key}`);
  }

  const body = response.Body as Readable;
  await pipeline(body, createWriteStream(destPath));

  logger.debug("Downloaded source object", { bucket, key, destPath });
}

/**
 * Download a source object from an arbitrary (pre-signed or public) URL to a
 * local file path.
 */
export async function downloadUrlToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download source video (${response.status}) from ${url}`);
  }

  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(body, createWriteStream(destPath));

  logger.debug("Downloaded source url", { url, destPath });
}

/** Upload a single screenshot frame buffer to the destination R2 bucket. */
export async function uploadFrame(params: {
  key: string;
  body: Buffer;
  contentType: string;
  /** Custom object metadata. Values must be ASCII strings. */
  metadata?: Record<string, string>;
}): Promise<void> {
  const { key, body, contentType, metadata } = params;

  await r2.send(
    new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    }),
  );
}

/** Upload the report manifest (JSON) describing every extracted frame. */
export async function uploadManifest(key: string, manifest: unknown): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
    }),
  );
}

export async function createSignedObjectUrl(params: {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  return getSignedUrl(r2 as never, command as never, {
    expiresIn: params.expiresInSeconds ?? 60 * 60,
  });
}
