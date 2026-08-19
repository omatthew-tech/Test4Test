import { createWriteStream } from "node:fs";
import { createServer } from "node:http";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
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
export async function assertBucketReachable(bucket = config.r2.bucketName): Promise<void> {
  try {
    await r2.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    throw new Error(
      `R2 HeadBucket failed for "${bucket}" at ${config.r2.endpoint} — ${formatR2Error(error)}`,
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

  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

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

/**
 * Present a private R2 object to FFmpeg through loopback HTTP. FFmpeg can issue
 * byte-range seeks without handling Cloudflare TLS itself, and the source is
 * never exposed publicly or downloaded in full.
 */
export async function withR2ObjectProxy<T>(
  params: { bucket: string; key: string },
  task: (url: string) => Promise<T>,
): Promise<T> {
  const server = createServer(async (request, response) => {
    if ((request.method !== "GET" && request.method !== "HEAD") || request.url !== "/source") {
      response.statusCode = 404;
      response.end();
      return;
    }

    const range = request.headers.range;
    if (range && !/^bytes=\d*-\d*$/.test(range)) {
      response.statusCode = 416;
      response.end();
      return;
    }

    try {
      if (request.method === "HEAD") {
        const head = await r2.send(
          new HeadObjectCommand({ Bucket: params.bucket, Key: params.key }),
        );
        response.statusCode = 200;
        response.setHeader("Accept-Ranges", "bytes");
        if (head.ContentLength !== undefined) {
          response.setHeader("Content-Length", String(head.ContentLength));
        }
        if (head.ContentType) {
          response.setHeader("Content-Type", head.ContentType);
        }
        response.end();
        return;
      }

      const object = await r2.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
          ...(range ? { Range: range } : {}),
        }),
      );
      response.statusCode = range ? 206 : 200;
      response.setHeader("Accept-Ranges", "bytes");
      if (object.ContentLength !== undefined) {
        response.setHeader("Content-Length", String(object.ContentLength));
      }
      if (object.ContentRange) {
        response.setHeader("Content-Range", object.ContentRange);
      }
      if (object.ContentType) {
        response.setHeader("Content-Type", object.ContentType);
      }
      if (!object.Body) {
        response.statusCode = 502;
        response.end();
        return;
      }

      await pipeline(object.Body as Readable, response);
    } catch (error) {
      logger.warn("R2 loopback proxy request failed", {
        bucket: params.bucket,
        key: params.key,
        range,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        response.statusCode = 502;
      }
      response.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not start the private recording range proxy.");
  }

  try {
    return await task(`http://127.0.0.1:${address.port}/source`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Upload a single screenshot frame buffer to the destination R2 bucket. */
export async function uploadFrame(params: {
  bucket?: string;
  key: string;
  body: Buffer;
  contentType: string;
  /** Custom object metadata. Values must be ASCII strings. */
  metadata?: Record<string, string>;
}): Promise<void> {
  const { bucket = config.r2.bucketName, key, body, contentType, metadata } = params;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
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

export async function deleteObjects(params: { bucket: string; keys: string[] }): Promise<string[]> {
  if (params.keys.length === 0) {
    return [];
  }

  const response = await r2.send(
    new DeleteObjectsCommand({
      Bucket: params.bucket,
      Delete: {
        Quiet: false,
        Objects: params.keys.slice(0, 1000).map((Key) => ({ Key })),
      },
    }),
  );

  if (response.Errors && response.Errors.length > 0) {
    throw new Error(`R2 could not delete ${response.Errors.length} recording thumbnail object(s).`);
  }

  return (response.Deleted ?? [])
    .map((entry) => entry.Key)
    .filter((key): key is string => typeof key === "string");
}
