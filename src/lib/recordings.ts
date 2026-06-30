import { ProductType, ResponseRecording } from "../types";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export const RECORDING_BUCKET_ID = "test-response-recordings";
export const R2_RECORDING_BUCKET_ID = `r2:${RECORDING_BUCKET_ID}`;
export const RECORDING_STORAGE_DAYS = 60;
export const RECORDING_MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
export const RECORDING_MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;
const RECORDING_MULTIPART_DEFAULT_PART_SIZE_BYTES = 10 * 1024 * 1024;
const RECORDING_UPLOAD_RETRY_DELAYS_MS = [750, 1500, 3000];
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
  publicTesterKey?: string;
  onProgress?: (progress: RecordingUploadProgress) => void;
}

type RecordingUploadIdentityOptions = Pick<RecordingUploadOptions, "publicTesterKey">;

interface RecordingUploadR2Response {
  ok?: boolean;
  bucket?: string;
  path?: string;
  uploadUrl?: string;
  uploadId?: string;
  partSizeBytes?: number;
  expiresInSeconds?: number;
  contentType?: string;
  width?: number;
  height?: number;
  error?: string;
  message?: string;
}

interface MultipartUploadCacheEntry {
  uploadId: string;
  partSizeBytes: number;
  completedParts: Array<{ partNumber: number; etag: string }>;
}

interface SignedUploadResponse {
  headers: {
    get: (name: string) => string | null;
  };
}

interface GeneratedRecordingThumbnail {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
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

const multipartUploadCache = new Map<string, MultipartUploadCacheEntry>();

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
      message: "Recording must be 1 GB or smaller.",
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

function getThumbnailExtension(contentType: string) {
  if (contentType.includes("png")) {
    return "png";
  }

  if (contentType.includes("webp")) {
    return "webp";
  }

  return "jpg";
}

function buildRecordingThumbnailPath(recordingPath: string, contentType: string) {
  const extension = getThumbnailExtension(contentType);
  const slashIndex = recordingPath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? recordingPath.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? recordingPath.slice(slashIndex + 1) : recordingPath;
  const baseName = fileName.replace(/\.[^/.]+$/, "") || "screen-recording";

  return `${directory}${baseName}.thumbnail.${extension}`;
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap, timeoutMs = 10000) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while preparing recording thumbnail."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener("error", handleError);
    };

    const handleEvent = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("The recording thumbnail could not be generated."));
    };

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, contentType: string, quality = 0.78) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), contentType, quality);
  });
}

async function captureRecordingThumbnail(file: File): Promise<GeneratedRecordingThumbnail | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const objectUrl = window.URL.createObjectURL(file);
  const video = document.createElement("video");

  try {
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await waitForVideoEvent(video, "loadedmetadata");

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const targetTime = duration > 0 ? Math.min(Math.max(duration * 0.08, 0.6), Math.max(0, duration - 0.1)) : 0;

    if (targetTime > 0) {
      video.currentTime = targetTime;
      await waitForVideoEvent(video, "seeked");
    } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, "loadeddata");
    }

    if (!video.videoWidth || !video.videoHeight) {
      return null;
    }

    const maxWidth = 520;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);

    const webp = await canvasToBlob(canvas, "image/webp", 0.76);
    const jpeg = webp ? null : await canvasToBlob(canvas, "image/jpeg", 0.78);
    const blob = webp ?? jpeg;

    if (!blob) {
      return null;
    }

    return {
      blob,
      contentType: blob.type || (webp ? "image/webp" : "image/jpeg"),
      width,
      height,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    window.URL.revokeObjectURL(objectUrl);
  }
}

function buildUploadProgress(bytesUploaded: number, bytesTotal: number, state: RecordingUploadProgress["state"]) {
  return {
    bytesUploaded,
    bytesTotal,
    percentage: bytesTotal > 0 ? Math.min(100, Math.max(0, (bytesUploaded / bytesTotal) * 100)) : 0,
    state,
  } satisfies RecordingUploadProgress;
}

async function getCurrentAccessToken() {
  const supabase = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Sign in again before uploading this recording.");
  }

  return session.access_token;
}

async function callRecordingUploadR2(
  payload: Record<string, unknown>,
  options: RecordingUploadIdentityOptions = {},
) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Recording uploads are not available in the current environment.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: supabasePublishableKey,
  };
  const publicTesterKey = options.publicTesterKey?.trim();
  const body = publicTesterKey
    ? { ...payload, publicTesterKey }
    : payload;

  if (!publicTesterKey) {
    const accessToken = await getCurrentAccessToken();
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/recording-upload-r2`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as RecordingUploadR2Response | null;

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error ??
        result?.message ??
        "The recording could not be uploaded.",
    );
  }

  return result;
}

function sendFileToSignedUrl(
  uploadUrl: string,
  body: Blob,
  options: {
    contentType?: string;
    retryLabel?: string;
    onUploadProgress?: (bytesUploaded: number) => void;
  } = {},
) {
  return new Promise<SignedUploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", uploadUrl);

    if (options.contentType) {
      request.setRequestHeader("Content-Type", options.contentType);
    }

    request.upload.onprogress = (event) => {
      options.onUploadProgress?.(Math.min(body.size, Math.max(0, event.loaded)));
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        options.onUploadProgress?.(body.size);
        resolve({
          headers: {
            get: (name: string) => request.getResponseHeader(name),
          },
        });
        return;
      }

      reject(
        new Error(
          request.responseText ||
            `${options.retryLabel ?? "Recording upload"} failed (${request.status}).`,
        ),
      );
    };

    request.onerror = () => {
      reject(new Error(`${options.retryLabel ?? "Recording upload"} failed. Check your connection and try again.`));
    };

    request.onabort = () => {
      reject(new Error(`${options.retryLabel ?? "Recording upload"} was cancelled.`));
    };

    request.send(body);
  });
}

async function uploadFileToSignedUrl(
  uploadUrl: string,
  body: Blob,
  options: {
    contentType?: string;
    retryLabel?: string;
    onUploadProgress?: (bytesUploaded: number) => void;
  } = {},
) {
  let lastError: Error | null = null;
  let maxReportedBytes = 0;

  for (let attempt = 0; attempt <= RECORDING_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await sendFileToSignedUrl(uploadUrl, body, {
        contentType: options.contentType,
        retryLabel: options.retryLabel,
        onUploadProgress: (bytesUploaded) => {
          maxReportedBytes = Math.max(maxReportedBytes, Math.min(body.size, bytesUploaded));
          options.onUploadProgress?.(maxReportedBytes);
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("The recording upload failed.");

      if (attempt >= RECORDING_UPLOAD_RETRY_DELAYS_MS.length) {
        break;
      }

      await new Promise((resolve) => window.setTimeout(resolve, RECORDING_UPLOAD_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError ?? new Error("The recording upload failed.");
}

async function uploadRecordingObjectSingle(
  path: string,
  file: File,
  contentType: string,
  onProgress?: RecordingUploadOptions["onProgress"],
  options: RecordingUploadIdentityOptions = {},
) {
  onProgress?.(buildUploadProgress(0, file.size, "uploading"));
  const createResult = await callRecordingUploadR2({
    action: "create_single",
    path,
    fileName: file.name,
    mimeType: contentType,
    fileSizeBytes: file.size,
  }, options);

  if (!createResult.uploadUrl) {
    throw new Error("The recording upload URL could not be created.");
  }

  let maxBytesUploaded = 0;

  await uploadFileToSignedUrl(createResult.uploadUrl, file, {
    contentType,
    retryLabel: "Recording upload",
    onUploadProgress: (bytesUploaded) => {
      maxBytesUploaded = Math.max(maxBytesUploaded, Math.min(file.size, bytesUploaded));
      onProgress?.(buildUploadProgress(maxBytesUploaded, file.size, "uploading"));
    },
  });
  onProgress?.(buildUploadProgress(file.size, file.size, "uploading"));

  await callRecordingUploadR2({
    action: "complete_single",
    path,
    fileName: file.name,
    mimeType: contentType,
    fileSizeBytes: file.size,
  }, options);
}

function getMultipartCacheKey(path: string, file: File, contentType: string) {
  return `${path}:${file.size}:${contentType}`;
}

async function uploadRecordingObjectMultipart(
  path: string,
  file: File,
  contentType: string,
  onProgress?: RecordingUploadOptions["onProgress"],
  options: RecordingUploadIdentityOptions = {},
) {
  const cacheKey = getMultipartCacheKey(path, file, contentType);
  let cacheEntry = multipartUploadCache.get(cacheKey);

  if (!cacheEntry) {
    const initiateResult = await callRecordingUploadR2({
      action: "initiate_multipart",
      path,
      fileName: file.name,
      mimeType: contentType,
      fileSizeBytes: file.size,
    }, options);

    if (!initiateResult.uploadId) {
      throw new Error("The multipart recording upload could not start.");
    }

    cacheEntry = {
      uploadId: initiateResult.uploadId,
      partSizeBytes: initiateResult.partSizeBytes ?? RECORDING_MULTIPART_DEFAULT_PART_SIZE_BYTES,
      completedParts: [],
    };
    multipartUploadCache.set(cacheKey, cacheEntry);
  }

  const completedPartNumbers = new Set(cacheEntry.completedParts.map((part) => part.partNumber));
  const totalParts = Math.ceil(file.size / cacheEntry.partSizeBytes);
  let uploadedBytes = cacheEntry.completedParts.reduce((total, part) => {
    const partStart = (part.partNumber - 1) * cacheEntry!.partSizeBytes;
    const partEnd = Math.min(file.size, partStart + cacheEntry!.partSizeBytes);
    return total + Math.max(0, partEnd - partStart);
  }, 0);

  onProgress?.(buildUploadProgress(uploadedBytes, file.size, uploadedBytes > 0 ? "retrying" : "uploading"));

  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (completedPartNumbers.has(partNumber)) {
      continue;
    }

    const partStart = (partNumber - 1) * cacheEntry.partSizeBytes;
    const partEnd = Math.min(file.size, partStart + cacheEntry.partSizeBytes);
    const partBlob = file.slice(partStart, partEnd);
    let partResponse: SignedUploadResponse | null = null;
    let maxPartBytesUploaded = 0;

    for (let attempt = 0; attempt <= RECORDING_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      const signedPart = await callRecordingUploadR2({
        action: "sign_part",
        path,
        fileName: file.name,
        mimeType: contentType,
        fileSizeBytes: file.size,
        uploadId: cacheEntry.uploadId,
        partNumber,
      }, options);

      if (!signedPart.uploadUrl) {
        throw new Error("The recording upload part URL could not be created.");
      }

      try {
        if (attempt > 0) {
          onProgress?.(buildUploadProgress(uploadedBytes, file.size, "retrying"));
        }

        partResponse = await uploadFileToSignedUrl(signedPart.uploadUrl, partBlob, {
          retryLabel: `Recording upload part ${partNumber}`,
          onUploadProgress: (partBytesUploaded) => {
            maxPartBytesUploaded = Math.max(
              maxPartBytesUploaded,
              Math.min(partBlob.size, partBytesUploaded),
            );
            onProgress?.(buildUploadProgress(uploadedBytes + maxPartBytesUploaded, file.size, "uploading"));
          },
        });
        break;
      } catch (error) {
        if (attempt >= RECORDING_UPLOAD_RETRY_DELAYS_MS.length) {
          throw error;
        }
      }
    }

    const etag = partResponse?.headers.get("etag")?.trim();

    if (!etag) {
      throw new Error("Cloudflare R2 did not return a part ETag. Check the R2 bucket CORS exposed headers.");
    }

    cacheEntry.completedParts = [
      ...cacheEntry.completedParts,
      { partNumber, etag },
    ];
    completedPartNumbers.add(partNumber);
    uploadedBytes += partBlob.size;
    onProgress?.(buildUploadProgress(uploadedBytes, file.size, "uploading"));
  }

  await callRecordingUploadR2({
    action: "complete_multipart",
    path,
    fileName: file.name,
    mimeType: contentType,
    fileSizeBytes: file.size,
    uploadId: cacheEntry.uploadId,
    parts: cacheEntry.completedParts,
  }, options);
  multipartUploadCache.delete(cacheKey);
  onProgress?.(buildUploadProgress(file.size, file.size, "uploading"));
}

async function uploadRecordingThumbnail(
  recordingPath: string,
  file: File,
  recordingContentType: string,
  options: RecordingUploadIdentityOptions = {},
): Promise<ResponseRecording["thumbnail"] | null> {
  const thumbnail = await captureRecordingThumbnail(file);

  if (!thumbnail) {
    return null;
  }

  const thumbnailPath = buildRecordingThumbnailPath(recordingPath, thumbnail.contentType);
  const payload = {
    path: recordingPath,
    fileName: file.name,
    mimeType: recordingContentType,
    fileSizeBytes: file.size,
    thumbnailPath,
    thumbnailContentType: thumbnail.contentType,
    thumbnailSizeBytes: thumbnail.blob.size,
    thumbnailWidth: thumbnail.width,
    thumbnailHeight: thumbnail.height,
  };

  const createResult = await callRecordingUploadR2({
    action: "create_thumbnail",
    ...payload,
  }, options);

  if (!createResult.uploadUrl) {
    throw new Error("The recording thumbnail upload URL could not be created.");
  }

  await uploadFileToSignedUrl(createResult.uploadUrl, thumbnail.blob, {
    contentType: thumbnail.contentType,
    retryLabel: "Recording thumbnail upload",
  });

  const completeResult = await callRecordingUploadR2({
    action: "complete_thumbnail",
    ...payload,
  }, options);

  return {
    bucket: completeResult.bucket ?? R2_RECORDING_BUCKET_ID,
    path: completeResult.path ?? thumbnailPath,
    contentType: completeResult.contentType ?? thumbnail.contentType,
    sizeBytes: thumbnail.blob.size,
    width: completeResult.width ?? thumbnail.width,
    height: completeResult.height ?? thumbnail.height,
  };
}

async function uploadRecordingObject(
  userId: string,
  sessionId: string,
  file: File,
  previousRecording?: ResponseRecording | null,
  options: RecordingUploadOptions = {},
) {
  const path = options.path ?? buildRecordingDraftPath(userId, sessionId, file.name);
  const contentType = normalizeRecordingMimeType(file.name, file.type) || "video/mp4";
  const shouldUseMultipartUpload = file.size > RECORDING_MULTIPART_UPLOAD_THRESHOLD_BYTES;

  if (shouldUseMultipartUpload) {
    await uploadRecordingObjectMultipart(path, file, contentType, options.onProgress, options);
  } else {
    await uploadRecordingObjectSingle(path, file, contentType, options.onProgress, options);
  }

  if (previousRecording?.path) {
    await deleteRecordingDraft(previousRecording, options).catch(() => undefined);
  }

  const uploadedAt = new Date().toISOString();
  const thumbnail = await uploadRecordingThumbnail(path, file, contentType, options).catch(() => null);

  return {
    bucket: R2_RECORDING_BUCKET_ID,
    path,
    fileName: file.name,
    mimeType: contentType,
    fileSizeBytes: file.size,
    uploadedAt,
    expiresAt: calculateRecordingExpiry(new Date(uploadedAt)),
    deletedAt: null,
    thumbnail,
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

  return uploadRecordingObject(userId, sessionId, recordingFile, previousRecording, options);
}

export async function deleteRecordingDraft(
  recording?: ResponseRecording | null,
  options: RecordingUploadIdentityOptions = {},
) {
  if (!recording?.path) {
    return;
  }

  if (recording.bucket === R2_RECORDING_BUCKET_ID) {
    await callRecordingUploadR2({
      action: "delete",
      path: recording.path,
      fileName: recording.fileName,
      mimeType: recording.mimeType,
      fileSizeBytes: recording.fileSizeBytes,
    }, options);
    return;
  }

  if (recording.bucket !== RECORDING_BUCKET_ID) {
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
