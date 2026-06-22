import { AwsClient } from "npm:aws4fetch@1.0.20";
import { getRecordingEnvironment } from "./response-recordings.ts";

export const R2_RECORDING_PROVIDER = "r2";
export const R2_RECORDING_BUCKET_NAME = "test-response-recordings";
export const R2_RECORDING_BUCKET_ID = `${R2_RECORDING_PROVIDER}:${R2_RECORDING_BUCKET_NAME}`;
export const R2_RECORDING_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
export const R2_RECORDING_STORAGE_DAYS = 60;
export const R2_RECORDING_ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export interface R2RecordingEnvironment {
  supabaseUrl: string;
  secretKey: string;
  cleanupSecret: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  providerBucket: string;
  endpoint: string;
}

export interface R2CompletedPart {
  partNumber: number;
  etag: string;
}

export function getR2RecordingEnvironment(): R2RecordingEnvironment {
  const baseEnv = getRecordingEnvironment();
  const accountId = Deno.env.get("R2_ACCOUNT_ID")?.trim() ?? "";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")?.trim() ?? "";
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")?.trim() ?? "";
  const bucketName = Deno.env.get("R2_BUCKET_NAME")?.trim() || R2_RECORDING_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Missing Cloudflare R2 recording secrets.");
  }

  return {
    ...baseEnv,
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    providerBucket: `${R2_RECORDING_PROVIDER}:${bucketName}`,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

export function createR2Client(env: R2RecordingEnvironment) {
  return new AwsClient({
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    region: "auto",
    service: "s3",
  });
}

function encodeObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

export function buildR2ObjectUrl(env: R2RecordingEnvironment, objectKey: string) {
  return new URL(`${env.endpoint}/${encodeURIComponent(env.bucketName)}/${encodeObjectKey(objectKey)}`);
}

export function isR2RecordingBucket(bucket: string | null | undefined) {
  return bucket === R2_RECORDING_BUCKET_ID || bucket === `r2:${Deno.env.get("R2_BUCKET_NAME")?.trim()}`;
}

export function calculateR2RecordingExpiry(uploadedAt = new Date()) {
  return new Date(uploadedAt.getTime() + R2_RECORDING_STORAGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function normalizeR2RecordingMimeType(fileName: string, mimeType: string | null | undefined) {
  const baseMimeType = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const normalizedFileName = fileName.trim().toLowerCase();

  if (R2_RECORDING_ALLOWED_MIME_TYPES.has(baseMimeType)) {
    return baseMimeType;
  }

  if (normalizedFileName.endsWith(".webm")) {
    return "video/webm";
  }

  if (normalizedFileName.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (normalizedFileName.endsWith(".mp4")) {
    return "video/mp4";
  }

  return baseMimeType;
}

export function validateR2RecordingObjectInput(input: {
  userId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}) {
  if (!input.objectKey.startsWith(`draft/${input.userId}/`)) {
    throw new Error("You can only upload recordings to your own draft path.");
  }

  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("Recording file size is invalid.");
  }

  if (input.fileSizeBytes > R2_RECORDING_MAX_FILE_SIZE_BYTES) {
    throw new Error("Recording must be 500 MB or smaller.");
  }

  const mimeType = normalizeR2RecordingMimeType(input.fileName, input.mimeType);

  if (!R2_RECORDING_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Upload an MP4, MOV, or WEBM recording.");
  }

  return mimeType;
}

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function parseR2UploadId(xml: string) {
  const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/i);
  return match?.[1] ? match[1].trim() : "";
}

export function buildCompleteMultipartXml(parts: R2CompletedPart[]) {
  const orderedParts = [...parts].sort((first, second) => first.partNumber - second.partNumber);
  const partXml = orderedParts
    .map((part) => (
      `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`
    ))
    .join("");

  return `<CompleteMultipartUpload>${partXml}</CompleteMultipartUpload>`;
}

export function buildDownloadContentDisposition(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._ -]+/g, "-") || "screen-recording.webm";
  return `attachment; filename="${safeName.replace(/"/g, "'")}"`;
}

export async function createR2PresignedUrl(
  env: R2RecordingEnvironment,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  objectKey: string,
  options: {
    expiresInSeconds?: number;
    contentType?: string;
    query?: Record<string, string>;
  } = {},
) {
  const r2 = createR2Client(env);
  const url = buildR2ObjectUrl(env, objectKey);

  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  url.searchParams.set("X-Amz-Expires", String(options.expiresInSeconds ?? 900));

  const headers = new Headers();

  if (options.contentType) {
    headers.set("Content-Type", options.contentType);
  }

  const signedRequest = await r2.sign(url.toString(), {
    method,
    headers,
    aws: { signQuery: true },
  });

  return signedRequest.url;
}

export async function r2Fetch(
  env: R2RecordingEnvironment,
  objectKey: string,
  init: RequestInit & { query?: Record<string, string> } = {},
) {
  const r2 = createR2Client(env);
  const url = buildR2ObjectUrl(env, objectKey);
  const { query, ...requestInit } = init;

  Object.entries(query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return r2.fetch(url.toString(), requestInit);
}
