import {
  createRecordingAdminClient,
  recordingCorsHeaders,
  recordingJson,
} from "../_shared/response-recordings.ts";
import {
  buildCompleteMultipartXml,
  calculateR2RecordingExpiry,
  createR2PresignedUrl,
  getR2RecordingEnvironment,
  parseR2UploadId,
  r2Fetch,
  validateR2RecordingObjectInput,
  type R2CompletedPart,
} from "../_shared/r2-recordings.ts";

type RecordingUploadAction =
  | "create_single"
  | "complete_single"
  | "initiate_multipart"
  | "sign_part"
  | "complete_multipart"
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
  parts?: R2CompletedPart[];
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

function isValidPublicTesterKey(value: string) {
  return /^[a-zA-Z0-9-]{16,128}$/.test(value);
}

async function verifyR2ObjectExists(env: ReturnType<typeof getR2RecordingEnvironment>, objectKey: string) {
  const headResponse = await r2Fetch(env, objectKey, { method: "HEAD" });

  if (!headResponse.ok) {
    throw new Error("The uploaded recording could not be verified.");
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
  const expiresAt = uploadedAt ? calculateR2RecordingExpiry(new Date(uploadedAt)) : null;

  const { error } = await admin
    .from("test_response_recording_uploads")
    .upsert(
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
        expires_at: expiresAt,
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
    return recordingJson({ error: error instanceof Error ? error.message : "Recording upload setup is incomplete." }, 500);
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

      return recordingJson({ ok: true, bucket: env.providerBucket, path: objectKey });
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
      });
    }

    if (action === "sign_part") {
      const uploadId = normalizeText(payload.uploadId);
      const partNumber = typeof payload.partNumber === "number" ? Math.round(payload.partNumber) : 0;

      if (!uploadId || partNumber < 1 || partNumber > 10000) {
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

      const uploadUrl = await createR2PresignedUrl(env, "PUT", objectKey, {
        expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
        query: {
          partNumber: String(partNumber),
          uploadId,
        },
      });

      return recordingJson({
        ok: true,
        uploadUrl,
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

      if (!completeResponse.ok) {
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

      const { data: uploadRow, error: uploadError } = await admin
        .from("test_response_recording_uploads")
        .select("id, attached_response_id")
        .eq("storage_bucket", env.providerBucket)
        .eq("object_key", objectKey)
        .eq(uploadOwnerColumn, uploadOwnerKey)
        .maybeSingle();

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      if (uploadRow?.attached_response_id) {
        throw new Error("Submitted recordings cannot be deleted from this page.");
      }

      await r2Fetch(env, objectKey, { method: "DELETE" }).catch(() => null);

      await admin
        .from("test_response_recording_uploads")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("storage_bucket", env.providerBucket)
        .eq("object_key", objectKey)
        .eq(uploadOwnerColumn, uploadOwnerKey)
        .is("attached_response_id", null);

      return recordingJson({ ok: true });
    }

    return recordingJson({ error: "Unsupported recording upload action." }, 400);
  } catch (error) {
    return recordingJson({ error: error instanceof Error ? error.message : "Recording upload failed." }, 400);
  }
});
