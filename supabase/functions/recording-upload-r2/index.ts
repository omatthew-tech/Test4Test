import {
  createRecordingAdminClient,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";
import {
  buildCompleteMultipartXml,
  createR2PresignedUrl,
  getR2RecordingEnvironment,
  parseR2UploadId,
  r2Fetch,
  validateR2RecordingObjectInput,
  validateR2RecordingThumbnailInput,
  type R2CompletedPart,
} from "../_shared/r2-recordings.ts";
import {
  enqueueRecordingThumbnailBatch,
  scheduleRecordingThumbnailTask,
  type RecordingThumbnailUploadRow,
} from "../_shared/recording-thumbnails.ts";

type RecordingUploadAction =
  | "create_single"
  | "complete_single"
  | "initiate_multipart"
  | "sign_part"
  | "sign_parts"
  | "complete_multipart"
  | "create_thumbnail"
  | "complete_thumbnail"
  | "abort"
  | "delete";

interface RecordingUploadRequest {
  action?: RecordingUploadAction;
  path?: string;
  publicTesterKey?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadId?: string;
  partNumber?: number;
  partNumbers?: number[];
  parts?: R2CompletedPart[];
  thumbnailPath?: string;
  thumbnailContentType?: string;
  thumbnailSizeBytes?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}

const MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024;
const PRESIGNED_UPLOAD_EXPIRES_SECONDS = 15 * 60;

function normalizePath(path: unknown) {
  return typeof path === "string" ? path.trim().replace(/^\/+/, "") : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFileSize(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function normalizePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isValidPublicTesterKey(value: string) {
  return /^[a-zA-Z0-9-]{16,128}$/.test(value);
}

async function verifyR2ObjectExists(
  env: ReturnType<typeof getR2RecordingEnvironment>,
  objectKey: string,
) {
  const headResponse = await r2Fetch(env, objectKey, { method: "HEAD" });

  if (!headResponse.ok) {
    throw new Error("The uploaded recording could not be verified.");
  }
}

async function loadUploadRow(
  admin: ReturnType<typeof createRecordingAdminClient>,
  input: {
    providerBucket: string;
    objectKey: string;
    ownerColumn: "tester_user_id" | "public_tester_key";
    ownerKey: string;
    required?: boolean;
  },
) {
  const { data, error } = await admin
    .from("test_response_recording_uploads")
    .select("*")
    .eq("storage_bucket", input.providerBucket)
    .eq("object_key", input.objectKey)
    .eq(input.ownerColumn, input.ownerKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data && input.required !== false) {
    throw new Error("Recording upload session not found.");
  }

  return data as RecordingThumbnailUploadRow | null;
}

async function scheduleCompletedUploadThumbnail(
  admin: ReturnType<typeof createRecordingAdminClient>,
  input: {
    providerBucket: string;
    objectKey: string;
    ownerColumn: "tester_user_id" | "public_tester_key";
    ownerKey: string;
  },
) {
  const uploadRow = await loadUploadRow(admin, input);
  if (uploadRow) {
    await enqueueRecordingThumbnailBatch(admin, [uploadRow]);
  }
}

async function upsertUploadRow(
  admin: ReturnType<typeof createRecordingAdminClient>,
  input: {
    userId: string | null;
    publicTesterKey: string | null;
    providerBucket: string;
    objectKey: string;
    uploadMode: "single" | "multipart";
    uploadId?: string | null;
    status: "pending" | "uploading" | "completed" | "aborted" | "deleted";
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    uploadedAt?: string | null;
  },
) {
  const { data: existingRow, error: existingError } = await admin
    .from("test_response_recording_uploads")
    .select("id, attached_response_id")
    .eq("storage_bucket", input.providerBucket)
    .eq("object_key", input.objectKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingRow?.attached_response_id) {
    throw new Error("This recording has already been submitted.");
  }

  const uploadedAt = input.uploadedAt ?? null;

  const { error } = await admin.from("test_response_recording_uploads").upsert(
    {
      tester_user_id: input.userId,
      public_tester_key: input.publicTesterKey,
      storage_provider: "r2",
      storage_bucket: input.providerBucket,
      object_key: input.objectKey,
      upload_mode: input.uploadMode,
      upload_id: input.uploadId ?? null,
      status: input.status,
      file_name: input.fileName,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      uploaded_at: uploadedAt,
      expires_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "storage_bucket,object_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: recordingCorsHeaders });
  }

  if (request.method !== "POST") {
    return recordingJson({ error: "Method not allowed." }, 405);
  }

  let env;

  try {
    env = getR2RecordingEnvironment();
  } catch (error) {
    return recordingJson(
      { error: error instanceof Error ? error.message : "Recording upload setup is incomplete." },
      500,
    );
  }

  const admin = createRecordingAdminClient(env);
  const payload = (await request.json().catch(() => ({}))) as RecordingUploadRequest;
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const publicTesterKey = normalizeText(payload.publicTesterKey);
  let userId: string | null = null;

  if (accessToken) {
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken);

    if (userError || !user) {
      return recordingJson({ error: userError?.message ?? "Unauthorized." }, 401);
    }

    userId = user.id;
  } else if (!isValidPublicTesterKey(publicTesterKey)) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  const uploadOwnerKey = userId ?? publicTesterKey;
  const uploadOwnerColumn = userId ? "tester_user_id" : "public_tester_key";
  const action = payload.action;
  const objectKey = normalizePath(payload.path);
  const fileName = normalizeText(payload.fileName);
  const rawMimeType = normalizeText(payload.mimeType);
  const fileSizeBytes = normalizeFileSize(payload.fileSizeBytes);
  const thumbnailPath = normalizePath(payload.thumbnailPath);
  const thumbnailContentType = normalizeText(payload.thumbnailContentType);
  const thumbnailSizeBytes = normalizeFileSize(payload.thumbnailSizeBytes);
  const thumbnailWidth = normalizePositiveInteger(payload.thumbnailWidth);
  const thumbnailHeight = normalizePositiveInteger(payload.thumbnailHeight);

  try {
    if (!action) {
      throw new Error("Missing recording upload action.");
    }

    if (action === "create_single") {
      const mimeType = validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName,
        mimeType: rawMimeType,
        fileSizeBytes,
      });

      await upsertUploadRow(admin, {
        userId,
        publicTesterKey: userId ? null : publicTesterKey,
        providerBucket: env.providerBucket,
        objectKey,
        uploadMode: "single",
        status: "pending",
        fileName,
        mimeType,
        fileSizeBytes,
      });

      const uploadUrl = await createR2PresignedUrl(env, "PUT", objectKey, {
        expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
        contentType: mimeType,
      });

      return recordingJson({
        ok: true,
        bucket: env.providerBucket,
        path: objectKey,
        uploadUrl,
        expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
      });
    }

    if (action === "complete_single") {
      const mimeType = validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName,
        mimeType: rawMimeType,
        fileSizeBytes,
      });

      await verifyR2ObjectExists(env, objectKey);

      await upsertUploadRow(admin, {
        userId,
        publicTesterKey: userId ? null : publicTesterKey,
        providerBucket: env.providerBucket,
        objectKey,
        uploadMode: "single",
        status: "completed",
        fileName,
        mimeType,
        fileSizeBytes,
        uploadedAt: new Date().toISOString(),
      });

      scheduleRecordingThumbnailTask(
        scheduleCompletedUploadThumbnail(admin, {
          providerBucket: env.providerBucket,
          objectKey,
          ownerColumn: uploadOwnerColumn,
          ownerKey: uploadOwnerKey,
        }),
      );

      return recordingJson({ ok: true, bucket: env.providerBucket, path: objectKey });
    }

    if (action === "create_thumbnail") {
      validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName: fileName || "screen-recording.webm",
        mimeType: rawMimeType || "video/webm",
        fileSizeBytes: fileSizeBytes || 1,
      });
      const thumbnail = validateR2RecordingThumbnailInput({
        userId: uploadOwnerKey,
        recordingObjectKey: objectKey,
        thumbnailObjectKey: thumbnailPath,
        contentType: thumbnailContentType,
        fileSizeBytes: thumbnailSizeBytes,
        width: thumbnailWidth,
        height: thumbnailHeight,
      });
      await loadUploadRow(admin, {
        providerBucket: env.providerBucket,
        objectKey,
        ownerColumn: uploadOwnerColumn,
        ownerKey: uploadOwnerKey,
      });
      const uploadUrl = await createR2PresignedUrl(env, "PUT", thumbnailPath, {
        expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
        contentType: thumbnail.contentType,
      });
      return recordingJson({
        ok: true,
        bucket: env.providerBucket,
        path: thumbnailPath,
        uploadUrl,
        expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
      });
    }

    if (action === "complete_thumbnail") {
      validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName: fileName || "screen-recording.webm",
        mimeType: rawMimeType || "video/webm",
        fileSizeBytes: fileSizeBytes || 1,
      });
      const thumbnail = validateR2RecordingThumbnailInput({
        userId: uploadOwnerKey,
        recordingObjectKey: objectKey,
        thumbnailObjectKey: thumbnailPath,
        contentType: thumbnailContentType,
        fileSizeBytes: thumbnailSizeBytes,
        width: thumbnailWidth,
        height: thumbnailHeight,
      });
      await verifyR2ObjectExists(env, thumbnailPath);
      const uploadRow = await loadUploadRow(admin, {
        providerBucket: env.providerBucket,
        objectKey,
        ownerColumn: uploadOwnerColumn,
        ownerKey: uploadOwnerKey,
      });
      if (!uploadRow) {
        throw new Error("Recording upload session not found.");
      }
      const thumbnailUpdate = {
        thumbnail_storage_bucket: env.providerBucket,
        thumbnail_path: thumbnailPath,
        thumbnail_content_type: thumbnail.contentType,
        thumbnail_size_bytes: thumbnail.fileSizeBytes,
        thumbnail_width: thumbnail.width,
        thumbnail_height: thumbnail.height,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await admin
        .from("test_response_recording_uploads")
        .update(thumbnailUpdate)
        .eq("id", uploadRow.id);
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (uploadRow.attached_response_id) {
        await admin
          .from("test_responses")
          .update({
            recording_thumbnail_bucket: env.providerBucket,
            recording_thumbnail_path: thumbnailPath,
            recording_thumbnail_content_type: thumbnail.contentType,
            recording_thumbnail_size_bytes: thumbnail.fileSizeBytes,
            recording_thumbnail_width: thumbnail.width,
            recording_thumbnail_height: thumbnail.height,
          })
          .eq("id", uploadRow.attached_response_id);
      }
      return recordingJson({
        ok: true,
        bucket: env.providerBucket,
        path: thumbnailPath,
        contentType: thumbnail.contentType,
        width: thumbnail.width,
        height: thumbnail.height,
      });
    }

    if (action === "initiate_multipart") {
      const mimeType = validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName,
        mimeType: rawMimeType,
        fileSizeBytes,
      });

      const initiateResponse = await r2Fetch(env, objectKey, {
        method: "POST",
        headers: {
          "Content-Type": mimeType,
        },
        query: {
          uploads: "",
        },
      });
      const initiateBody = await initiateResponse.text();

      if (!initiateResponse.ok) {
        throw new Error(initiateBody || "Cloudflare R2 could not start the multipart upload.");
      }

      const uploadId = parseR2UploadId(initiateBody);

      if (!uploadId) {
        throw new Error("Cloudflare R2 did not return a multipart upload id.");
      }

      await upsertUploadRow(admin, {
        userId,
        publicTesterKey: userId ? null : publicTesterKey,
        providerBucket: env.providerBucket,
        objectKey,
        uploadMode: "multipart",
        uploadId,
        status: "uploading",
        fileName,
        mimeType,
        fileSizeBytes,
      });

      return recordingJson({
        ok: true,
        bucket: env.providerBucket,
        path: objectKey,
        uploadId,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        supportsBatchSigning: true,
      });
    }

    if (action === "sign_part" || action === "sign_parts") {
      const uploadId = normalizeText(payload.uploadId);
      const partNumber =
        typeof payload.partNumber === "number" ? Math.round(payload.partNumber) : 0;

      const partNumbers = action === "sign_parts" ? payload.partNumbers : [partNumber];
      if (
        !uploadId ||
        !Array.isArray(partNumbers) ||
        partNumbers.length < 1 ||
        partNumbers.length > 3 ||
        partNumbers.some((part) => !Number.isInteger(part) || part < 1 || part > 10000)
      ) {
        throw new Error("Invalid multipart upload part.");
      }

      validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName: fileName || "screen-recording.webm",
        mimeType: rawMimeType || "video/webm",
        fileSizeBytes: fileSizeBytes || 1,
      });

      const { data: uploadRow, error: uploadError } = await admin
        .from("test_response_recording_uploads")
        .select("id")
        .eq("storage_bucket", env.providerBucket)
        .eq("object_key", objectKey)
        .eq(uploadOwnerColumn, uploadOwnerKey)
        .eq("upload_id", uploadId)
        .eq("status", "uploading")
        .maybeSingle();

      if (uploadError || !uploadRow) {
        throw new Error(uploadError?.message ?? "Multipart upload session not found.");
      }

      const signedParts = await Promise.all(
        partNumbers.map(async (partNumber) => ({
          partNumber,
          uploadUrl: await createR2PresignedUrl(env, "PUT", objectKey, {
            expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
            query: {
              partNumber: String(partNumber),
              uploadId,
            },
          }),
        })),
      );

      return recordingJson({
        ok: true,
        ...(action === "sign_parts" ? { signedParts } : { uploadUrl: signedParts[0].uploadUrl }),
        expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
      });
    }

    if (action === "complete_multipart") {
      const uploadId = normalizeText(payload.uploadId);
      const parts = Array.isArray(payload.parts) ? payload.parts : [];
      const mimeType = validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName,
        mimeType: rawMimeType,
        fileSizeBytes,
      });

      if (!uploadId || parts.length === 0) {
        throw new Error("Missing multipart upload completion details.");
      }

      const uploadRow = (await loadUploadRow(admin, {
        providerBucket: env.providerBucket,
        objectKey,
        ownerColumn: uploadOwnerColumn,
        ownerKey: uploadOwnerKey,
      })) as (RecordingThumbnailUploadRow & { upload_id: string }) | null;
      if (
        !uploadRow ||
        uploadRow.upload_id !== uploadId ||
        uploadRow.attached_response_id ||
        (uploadRow.status !== "uploading" && uploadRow.status !== "completed")
      ) {
        throw new Error("Multipart upload session is no longer available.");
      }
      // A client may time out after the server commits. Reconfirm the same
      // upload without asking R2 to complete a consumed multipart ID again.
      if (uploadRow.status === "completed") {
        return recordingJson({ ok: true, bucket: env.providerBucket, path: objectKey });
      }

      const completeResponse = await r2Fetch(env, objectKey, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: buildCompleteMultipartXml(parts),
        query: {
          uploadId,
        },
      });
      const completeBody = await completeResponse.text();

      if (!completeResponse.ok && !completeBody.includes("<Code>NoSuchUpload</Code>")) {
        throw new Error(completeBody || "Cloudflare R2 could not finish the multipart upload.");
      }

      await verifyR2ObjectExists(env, objectKey);

      await upsertUploadRow(admin, {
        userId,
        publicTesterKey: userId ? null : publicTesterKey,
        providerBucket: env.providerBucket,
        objectKey,
        uploadMode: "multipart",
        uploadId,
        status: "completed",
        fileName,
        mimeType,
        fileSizeBytes,
        uploadedAt: new Date().toISOString(),
      });

      scheduleRecordingThumbnailTask(
        scheduleCompletedUploadThumbnail(admin, {
          providerBucket: env.providerBucket,
          objectKey,
          ownerColumn: uploadOwnerColumn,
          ownerKey: uploadOwnerKey,
        }),
      );

      return recordingJson({ ok: true, bucket: env.providerBucket, path: objectKey });
    }

    if (action === "abort") {
      const uploadId = normalizeText(payload.uploadId);

      if (objectKey && uploadId) {
        await r2Fetch(env, objectKey, {
          method: "DELETE",
          query: { uploadId },
        }).catch(() => null);
      }

      if (objectKey) {
        await admin
          .from("test_response_recording_uploads")
          .update({ status: "aborted", updated_at: new Date().toISOString() })
          .eq("storage_bucket", env.providerBucket)
          .eq("object_key", objectKey)
          .eq(uploadOwnerColumn, uploadOwnerKey)
          .is("attached_response_id", null);
      }

      return recordingJson({ ok: true });
    }

    if (action === "delete") {
      validateR2RecordingObjectInput({
        userId: uploadOwnerKey,
        objectKey,
        fileName: fileName || "screen-recording.webm",
        mimeType: rawMimeType || "video/webm",
        fileSizeBytes: fileSizeBytes || 1,
      });

      const uploadRow = await loadUploadRow(admin, {
        providerBucket: env.providerBucket,
        objectKey,
        ownerColumn: uploadOwnerColumn,
        ownerKey: uploadOwnerKey,
        required: false,
      });

      if (uploadRow?.attached_response_id) {
        throw new Error("Submitted recordings cannot be deleted from this page.");
      }

      const { data: claimed, error: claimError } = await admin
        .from("test_response_recording_uploads")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("storage_bucket", env.providerBucket)
        .eq("object_key", objectKey)
        .eq(uploadOwnerColumn, uploadOwnerKey)
        .is("attached_response_id", null)
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) {
        throw new Error("The recording is submitted or no longer available as a draft.");
      }

      await r2Fetch(env, objectKey, { method: "DELETE" }).catch(() => null);
      if (uploadRow?.thumbnail_path) {
        await r2Fetch(env, uploadRow.thumbnail_path, { method: "DELETE" }).catch(() => null);
      }

      return recordingJson({ ok: true });
    }

    return recordingJson({ error: "Unsupported recording upload action." }, 400);
  } catch (error) {
    return recordingJson(
      { error: error instanceof Error ? error.message : "Recording upload failed." },
      400,
    );
  }
});
