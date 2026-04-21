import { ProductType, ResponseRecording } from "../types";
import { requireSupabase } from "./supabase";

export const RECORDING_BUCKET_ID = "test-response-recordings";
export const RECORDING_STORAGE_DAYS = 7;
export const RECORDING_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
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

export interface RecordingExperience {
  mode: RecordingExperienceMode;
  reason: string;
  isMobile: boolean;
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
  url?: string;
  fileName?: string;
  expiresInSeconds?: number;
  error?: string;
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    mobile?: boolean;
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
      isChromiumDesktop: false,
    };
  }

  const navigatorRef = navigator as NavigatorWithUserAgentData;
  const isMobile = isProbablyMobileNavigator(navigatorRef);
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
      isChromiumDesktop,
    };
  }

  if (!hasNativeCaptureApis) {
    return {
      mode: "manual-upload",
      reason: "Native browser recording works on desktop Chrome and Edge for website tests.",
      isMobile,
      isChromiumDesktop,
    };
  }

  if (productType === "website" && !isMobile && isChromiumDesktop) {
    return {
      mode: "native-desktop",
      reason: "Chrome or Edge will open the browser's built-in share picker so you can record and upload automatically.",
      isMobile,
      isChromiumDesktop,
    };
  }

  return {
    mode: "manual-upload",
    reason: isMobile
      ? "Native browser recording is desktop-only right now, so keep using your device recorder and upload afterward."
      : "Native browser recording works on desktop Chrome and Edge for website tests.",
    isMobile,
    isChromiumDesktop,
  };
}

function fileHasAcceptedExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return RECORDING_ACCEPTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function validateRecordingFile(file: File) {
  const hasAcceptedMimeType = RECORDING_ACCEPTED_MIME_TYPES.includes(
    file.type as (typeof RECORDING_ACCEPTED_MIME_TYPES)[number],
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

async function uploadRecordingObject(
  userId: string,
  sessionId: string,
  file: File,
  previousRecording?: ResponseRecording | null,
) {
  const supabase = requireSupabase();
  const path = buildRecordingDraftPath(userId, sessionId, file.name);
  const contentType = file.type || "video/mp4";

  const { error } = await supabase.storage.from(RECORDING_BUCKET_ID).upload(path, file, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
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
) {
  return uploadRecordingObject(userId, sessionId, file, previousRecording);
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
  const extension = mimeType.toLowerCase().includes("webm") ? "webm" : "mp4";
  return `screen-recording-${sessionId}.${extension}`;
}

export async function uploadGeneratedRecordingDraft(
  userId: string,
  sessionId: string,
  blob: Blob,
  mimeType: string,
  previousRecording?: ResponseRecording | null,
) {
  const fileName = createGeneratedRecordingFileName(sessionId, mimeType || "video/webm");
  const recordingFile = new File([blob], fileName, {
    type: mimeType || "video/webm",
    lastModified: Date.now(),
  });

  return uploadRecordingObject(userId, sessionId, recordingFile, previousRecording);
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
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("get-response-recording-access", {
    body: {
      responseId,
      download,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as RecordingAccessResponse;

  if (!payload.url) {
    throw new Error(payload.error ?? "Recording is not available right now.");
  }

  return {
    url: payload.url,
    fileName: payload.fileName ?? "screen-recording.mp4",
    expiresInSeconds: payload.expiresInSeconds ?? 300,
  };
}
