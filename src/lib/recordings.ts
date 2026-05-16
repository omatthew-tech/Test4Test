import * as tus from "tus-js-client";
import { ProductType, ResponseRecording } from "../types";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export const RECORDING_BUCKET_ID = "test-response-recordings";
export const RECORDING_STORAGE_DAYS = 7;
export const RECORDING_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
export const RECORDING_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const RECORDING_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const RECORDING_TUS_RETRY_DELAYS_MS = [0, 3000, 5000, 10000, 20000];
export const RECORDING_ACCEPTED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export const RECORDING_ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;
export const RECORDING_ACCEPT_ATTRIBUTE = ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm";

export type RecordingTestPhase =
  | "preflight"
  | "recording_live"
  | "uploading_recording"
  | "return_and_submit";

export type RecordingExperienceMode = "native-desktop" | "manual-upload";
export type MobileOperatingSystem = "ios" | "android" | "unknown";

export interface RecordingExperience {
  mode: RecordingExperienceMode;
  reason: string;
  isMobile: boolean;
  mobileOs: MobileOperatingSystem;
  isChromiumDesktop: boolean;
}

export interface RecordingTestSessionState {
  submissionId: string;
  sessionId: string;
  phase: RecordingTestPhase;
  chosenProductType: ProductType | null;
  confirmedRecording: boolean;
  recording: ResponseRecording | null;
}

interface RecordingAccessResponse {
  ok?: boolean;
  url?: string;
  fileName?: string;
  expiresInSeconds?: number;
  error?: string;
  message?: string;
}

export interface RecordingUploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  state: "uploading" | "retrying";
}

export interface RecordingUploadOptions {
  path?: string;
  preferResumable?: boolean;
  onProgress?: (progress: RecordingUploadProgress) => void;
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
    brands?: Array<{
      brand?: string;
      version?: string;
    }>;
  };
}

function buildRecordingSessionStorageKey(submissionId: string) {
  return `test4test:recording-session:${submissionId}`;
}

export function createRecordingSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `recording-${Math.random().toString(36).slice(2, 10)}`;
}

export function calculateRecordingExpiry(uploadedAt = new Date()) {
  return new Date(uploadedAt.getTime() + RECORDING_STORAGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function loadRecordingTestSession(submissionId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(buildRecordingSessionStorageKey(submissionId));

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<RecordingTestSessionState>;

    if (
      typeof parsed.submissionId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      (
        parsed.phase !== "preflight" &&
        parsed.phase !== "recording_live" &&
        parsed.phase !== "uploading_recording" &&
        parsed.phase !== "return_and_submit"
      )
    ) {
      return null;
    }

    return {
      submissionId: parsed.submissionId,
      sessionId: parsed.sessionId,
      phase: parsed.phase,
      chosenProductType:
        parsed.chosenProductType === "website" ||
        parsed.chosenProductType === "ios" ||
        parsed.chosenProductType === "android"
          ? parsed.chosenProductType
          : null,
      confirmedRecording: parsed.confirmedRecording === true,
      recording: parsed.recording ?? null,
    } satisfies RecordingTestSessionState;
  } catch {
    return null;
  }
}

export function saveRecordingTestSession(state: RecordingTestSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(buildRecordingSessionStorageKey(state.submissionId), JSON.stringify(state));
}

export function clearRecordingTestSession(submissionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(buildRecordingSessionStorageKey(submissionId));
}

function isProbablyMobileNavigator(navigatorRef: NavigatorWithUserAgentData) {
  if (typeof navigatorRef.userAgentData?.mobile === "boolean") {
    return navigatorRef.userAgentData.mobile;
  }

  return /android|iphone|ipad|ipod|mobile/i.test(navigatorRef.userAgent);
}

function detectMobileOperatingSystem(navigatorRef: NavigatorWithUserAgentData): MobileOperatingSystem {
  const userAgent = navigatorRef.userAgent.toLowerCase();
  const platform = navigatorRef.userAgentData?.platform?.toLowerCase() ?? navigatorRef.platform.toLowerCase();

  if (platform.includes("android") || userAgent.includes("android")) {
    return "android";
  }

  if (
    platform.includes("ios") ||
    /iphone|ipad|ipod/.test(userAgent) ||
    /iphone|ipad|ipod/.test(platform) ||
    (platform.includes("mac") && navigatorRef.maxTouchPoints > 1)
  ) {
    return "ios";
  }

  return "unknown";
}

function isChromiumDesktopNavigator(navigatorRef: NavigatorWithUserAgentData) {
  const brandNames = navigatorRef.userAgentData?.brands?.map((brand) => brand.brand?.toLowerCase() ?? "") ?? [];
  const userAgent = navigatorRef.userAgent;
  const hasChromiumBrand = brandNames.some(
    (brand) => brand.includes("google chrome") || brand.includes("chromium") || brand.includes("microsoft edge"),
  );
  const hasChromeUserAgent = /chrome\//i.test(userAgent) || /edg\//i.test(userAgent);
  const isOpera = /opr\//i.test(userAgent) || brandNames.some((brand) => brand.includes("opera"));
  const isFirefox = /firefox\//i.test(userAgent) || brandNames.some((brand) => brand.includes("firefox"));
  const isSafariOnly =
    /safari\//i.test(userAgent) &&
    !/chrome\//i.test(userAgent) &&
    !/chromium/i.test(userAgent) &&
    !/edg\//i.test(userAgent);

  return !isOpera && !isFirefox && !isSafariOnly && (hasChromiumBrand || hasChromeUserAgent);
}

export function resolveRecordingExperience(productType: ProductType | null | undefined): RecordingExperience {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      mode: "manual-upload",
      reason: "Native browser recording works on desktop Chrome and Edge for website tests.",
      isMobile: false,
      mobileOs: "unknown",
      isChromiumDesktop: false,
    };
  }

  const navigatorRef = navigator as NavigatorWithUserAgentData;
  const isMobile = isProbablyMobileNavigator(navigatorRef);
  const mobileOs = isMobile ? detectMobileOperatingSystem(navigatorRef) : "unknown";
  const isChromiumDesktop = isChromiumDesktopNavigator(navigatorRef);
  const hasNativeCaptureApis =
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  if (productType === "ios" || productType === "android") {
    return {
      mode: "manual-upload",
      reason: "This test targets a phone app, so keep using your device recorder and upload afterward.",
      isMobile,
      mobileOs,
      isChromiumDesktop,
    };
  }

  if (!hasNativeCaptureApis) {
    return {
      mode: "manual-upload",
      reason: "Native browser recording works on desktop Chrome and Edge for website tests.",
      isMobile,
      mobileOs,
      isChromiumDesktop,
    };
  }

  if (productType === "website" && !isMobile && isChromiumDesktop) {
    return {
      mode: "native-desktop",
      reason: "Chrome or Edge will open the browser's built-in share picker so you can record and upload automatically.",
      isMobile,
      mobileOs,
      isChromiumDesktop,
    };
  }

  return {
    mode: "manual-upload",
    reason: isMobile
      ? "Native browser recording is desktop-only right now, so keep using your device recorder and upload afterward."
      : "Native browser recording works on desktop Chrome and Edge for website tests.",
    isMobile,
    mobileOs,
    isChromiumDesktop,
  };
}

function fileHasAcceptedExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return RECORDING_ACCEPTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function normalizeRecordingMimeType(fileName: string, mimeType: string | null | undefined) {
  const baseMimeType = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const normalizedFileName = fileName.trim().toLowerCase();

  if (RECORDING_ACCEPTED_MIME_TYPES.includes(baseMimeType as (typeof RECORDING_ACCEPTED_MIME_TYPES)[number])) {
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

export function validateRecordingFile(file: File) {
  const normalizedMimeType = normalizeRecordingMimeType(file.name, file.type);
  const hasAcceptedMimeType = RECORDING_ACCEPTED_MIME_TYPES.includes(
    normalizedMimeType as (typeof RECORDING_ACCEPTED_MIME_TYPES)[number],
  );

  if (!hasAcceptedMimeType && !fileHasAcceptedExtension(file.name)) {
    return {
      ok: false,
      message: "Upload an MP4, MOV, or WEBM recording.",
    };
  }

  if (file.size > RECORDING_MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: "Recording must be 500 MB or smaller.",
    };
  }

  return { ok: true, message: "Recording looks ready to upload." };
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || "screen-recording.mp4";
}

export function buildRecordingDraftPath(userId: string, sessionId: string, fileName: string) {
  return `draft/${userId}/${sessionId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function getResumableUploadEndpoint() {
  if (!supabaseUrl) {
    throw new Error("Missing Supabase configuration for recording uploads.");
  }

  const parsedUrl = new URL(supabaseUrl);
  const projectRef = parsedUrl.hostname.split(".")[0];

  if (projectRef && parsedUrl.hostname.endsWith(".supabase.co")) {
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }

  return `${parsedUrl.origin}/storage/v1/upload/resumable`;
}

function buildUploadProgress(bytesUploaded: number, bytesTotal: number, state: RecordingUploadProgress["state"]) {
  return {
    bytesUploaded,
    bytesTotal,
    percentage: bytesTotal > 0 ? Math.min(100, Math.max(0, (bytesUploaded / bytesTotal) * 100)) : 0,
    state,
  } satisfies RecordingUploadProgress;
}

function getRecordingUploadErrorMessage(error: Error | tus.DetailedError) {
  if (error instanceof tus.DetailedError) {
    const status = error.originalResponse?.getStatus();
    const body = error.originalResponse?.getBody()?.trim();

    if (body) {
      return `Recording upload failed${status ? ` (${status})` : ""}: ${body}`;
    }
  }

  return error.message || "The recording could not be uploaded.";
}

async function uploadRecordingObjectResumable(
  path: string,
  file: File,
  contentType: string,
  onProgress?: RecordingUploadOptions["onProgress"],
) {
  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Sign in again before uploading this recording.");
  }

  let lastBytesUploaded = 0;
  const bytesTotal = file.size;
  const fingerprint = `test4test-recording:${RECORDING_BUCKET_ID}:${path}:${file.size}:${contentType}`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: getResumableUploadEndpoint(),
      headers: {
        authorization: `Bearer ${session.access_token}`,
      },
      metadata: {
        bucketName: RECORDING_BUCKET_ID,
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RECORDING_TUS_CHUNK_SIZE_BYTES,
      retryDelays: RECORDING_TUS_RETRY_DELAYS_MS,
      fingerprint: async () => fingerprint,
      onProgress: (bytesUploaded, nextBytesTotal) => {
        lastBytesUploaded = bytesUploaded;
        onProgress?.(buildUploadProgress(bytesUploaded, nextBytesTotal, "uploading"));
      },
      onShouldRetry: (error) => {
        const status = error.originalResponse?.getStatus();

        if (status && [400, 401, 403, 404, 409, 413, 415].includes(status)) {
          return false;
        }

        onProgress?.(buildUploadProgress(lastBytesUploaded, bytesTotal, "retrying"));
        return true;
      },
      onError: (error) => {
        reject(new Error(getRecordingUploadErrorMessage(error)));
      },
      onSuccess: () => {
        onProgress?.(buildUploadProgress(bytesTotal, bytesTotal, "uploading"));
        resolve();
      },
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      const [previousUpload] = previousUploads;

      if (previousUpload) {
        upload.resumeFromPreviousUpload(previousUpload);
      }

      onProgress?.(buildUploadProgress(0, bytesTotal, "uploading"));
      upload.start();
    }).catch((error) => reject(error instanceof Error ? error : new Error("The recording upload could not start.")));
  });
}

async function uploadRecordingObjectStandard(
  path: string,
  file: File,
  contentType: string,
) {
  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(RECORDING_BUCKET_ID).upload(path, file, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function uploadRecordingObject(
  userId: string,
  sessionId: string,
  file: File,
  previousRecording?: ResponseRecording | null,
  options: RecordingUploadOptions = {},
) {
  const supabase = requireSupabase();
  const path = options.path ?? buildRecordingDraftPath(userId, sessionId, file.name);
  const contentType = normalizeRecordingMimeType(file.name, file.type) || "video/mp4";
  const shouldUseResumableUpload =
    options.preferResumable === true ||
    file.size > RECORDING_RESUMABLE_UPLOAD_THRESHOLD_BYTES;

  if (shouldUseResumableUpload) {
    await uploadRecordingObjectResumable(path, file, contentType, options.onProgress);
  } else {
    options.onProgress?.(buildUploadProgress(0, file.size, "uploading"));
    await uploadRecordingObjectStandard(path, file, contentType);
    options.onProgress?.(buildUploadProgress(file.size, file.size, "uploading"));
  }

  if (previousRecording?.bucket === RECORDING_BUCKET_ID && previousRecording.path) {
    await supabase.storage.from(RECORDING_BUCKET_ID).remove([previousRecording.path]);
  }

  const uploadedAt = new Date().toISOString();

  return {
    bucket: RECORDING_BUCKET_ID,
    path,
    fileName: file.name,
    mimeType: contentType,
    fileSizeBytes: file.size,
    uploadedAt,
    expiresAt: calculateRecordingExpiry(new Date(uploadedAt)),
    deletedAt: null,
  } satisfies ResponseRecording;
}

export async function uploadRecordingDraft(
  userId: string,
  sessionId: string,
  file: File,
  previousRecording?: ResponseRecording | null,
  options?: RecordingUploadOptions,
) {
  return uploadRecordingObject(userId, sessionId, file, previousRecording, options);
}

export function getPreferredMediaRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const preferredTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return preferredTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

export function createGeneratedRecordingFileName(sessionId: string, mimeType: string) {
  const extension = normalizeRecordingMimeType("", mimeType).includes("webm") ? "webm" : "mp4";
  return `screen-recording-${sessionId}.${extension}`;
}

export async function uploadGeneratedRecordingDraft(
  userId: string,
  sessionId: string,
  blob: Blob,
  mimeType: string,
  previousRecording?: ResponseRecording | null,
  options?: RecordingUploadOptions,
) {
  const normalizedMimeType = normalizeRecordingMimeType("", mimeType || "video/webm") || "video/webm";
  const fileName = createGeneratedRecordingFileName(sessionId, normalizedMimeType);
  const recordingFile = new File([blob], fileName, {
    type: normalizedMimeType,
    lastModified: Date.now(),
  });

  return uploadRecordingObject(userId, sessionId, recordingFile, previousRecording, {
    ...options,
    preferResumable: true,
  });
}

export async function deleteRecordingDraft(recording?: ResponseRecording | null) {
  if (!recording?.path || recording.bucket !== RECORDING_BUCKET_ID) {
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(RECORDING_BUCKET_ID).remove([recording.path]);

  if (error) {
    throw new Error(error.message);
  }
}

export function downloadRecordingBackup(blob: Blob, fileName: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeFileName(fileName);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

export async function requestResponseRecordingUrl(responseId: string, download = false) {
  if (!responseId || !supabaseUrl || !supabasePublishableKey) {
    throw new Error("Recording playback is not available in the current environment.");
  }

  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Sign in again to view this recording.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/get-response-recording-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify({
      responseId,
      download,
    }),
  });
  const payload = (await response.json().catch(() => null)) as RecordingAccessResponse | null;

  if (!response.ok || !payload?.url) {
    throw new Error(
      payload?.error ??
        payload?.message ??
        "Recording is not available right now.",
    );
  }

  return {
    url: payload.url,
    fileName: payload.fileName ?? "screen-recording.mp4",
    expiresInSeconds: payload.expiresInSeconds ?? 300,
  };
}
