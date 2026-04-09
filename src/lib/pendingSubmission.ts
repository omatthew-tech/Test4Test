import { Question, SubmissionDraft } from "../types";

const PENDING_SUBMISSION_PREFIX = "test4test-pending-submission:";
const OTP_CHALLENGE_KEY = "test4test-otp-challenge";
const SUBMIT_FLOW_RESUME_KEY = "test4test-submit-flow-resume:v1";
const PENDING_SUBMISSION_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const SUBMIT_FLOW_RESUME_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;

export type SubmitFlowResumePhase = "wizard" | "email" | "verify-code";
type StoredAiQuestionStatus = "idle" | "ready" | "error";

export interface PendingSubmissionPayload {
  id: string;
  draft: SubmissionDraft;
  questions: Question[];
  createdAt: string;
}

export interface StoredOtpChallenge {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  resendCount: number;
  submissionId?: string;
}

export interface SubmitFlowResumePayload {
  phase: SubmitFlowResumePhase;
  currentStep: number;
  draft: SubmissionDraft;
  generalQuestions: Question[];
  customQuestions: Question[];
  aiQuestions: Question[];
  hasGeneratedGeneralQuestions: boolean;
  aiQuestionStatus: StoredAiQuestionStatus;
  aiQuestionError: string;
  aiQuestionNotice: string;
  aiQuestionSourceKey: string | null;
  submissionId: string | null;
  email: string;
  updatedAt: string;
}

interface VersionedSubmitFlowResumePayload extends SubmitFlowResumePayload {
  version: 1;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function readStoredValue(key: string) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const sessionValue = window.sessionStorage.getItem(key);

    if (sessionValue) {
      return sessionValue;
    }
  } catch {
    // Ignore storage read failures and fall back to the next storage.
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures so the flow still works in-memory.
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures so the flow still works in-memory.
  }
}

function removeStoredValue(key: string) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}

function hasExpired(timestamp: string, retentionMs: number) {
  const time = Date.parse(timestamp);

  if (Number.isNaN(time)) {
    return true;
  }

  return Date.now() - time > retentionMs;
}

export function createPendingSubmissionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pending-${crypto.randomUUID()}`;
  }

  return `pending-${Math.random().toString(36).slice(2, 10)}`;
}

export function savePendingSubmission(payload: PendingSubmissionPayload) {
  if (!isBrowser()) {
    return;
  }

  writeStoredValue(`${PENDING_SUBMISSION_PREFIX}${payload.id}`, JSON.stringify(payload));
}

export function getPendingSubmission(id: string) {
  const storageKey = `${PENDING_SUBMISSION_PREFIX}${id}`;
  const stored = readStoredValue(storageKey);

  if (!stored) {
    return null;
  }

  try {
    const payload = JSON.parse(stored) as PendingSubmissionPayload;

    if (hasExpired(payload.createdAt, PENDING_SUBMISSION_RETENTION_MS)) {
      removeStoredValue(storageKey);
      return null;
    }

    return payload;
  } catch {
    removeStoredValue(storageKey);
    return null;
  }
}

export function clearPendingSubmission(id: string) {
  removeStoredValue(`${PENDING_SUBMISSION_PREFIX}${id}`);
}

export function storeOtpChallenge(challenge: StoredOtpChallenge) {
  writeStoredValue(OTP_CHALLENGE_KEY, JSON.stringify(challenge));
}

export function getStoredOtpChallenge() {
  const stored = readStoredValue(OTP_CHALLENGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const challenge = JSON.parse(stored) as StoredOtpChallenge;
    const expiresAt = Date.parse(challenge.expiresAt);

    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      removeStoredValue(OTP_CHALLENGE_KEY);
      return null;
    }

    return challenge;
  } catch {
    removeStoredValue(OTP_CHALLENGE_KEY);
    return null;
  }
}

export function clearStoredOtpChallenge() {
  removeStoredValue(OTP_CHALLENGE_KEY);
}

export function saveSubmitFlowResume(payload: SubmitFlowResumePayload) {
  writeStoredValue(
    SUBMIT_FLOW_RESUME_KEY,
    JSON.stringify({
      version: 1,
      ...payload,
    } satisfies VersionedSubmitFlowResumePayload),
  );
}

export function getSubmitFlowResume() {
  const stored = readStoredValue(SUBMIT_FLOW_RESUME_KEY);

  if (!stored) {
    return null;
  }

  try {
    const payload = JSON.parse(stored) as VersionedSubmitFlowResumePayload;

    if (payload.version !== 1 || hasExpired(payload.updatedAt, SUBMIT_FLOW_RESUME_RETENTION_MS)) {
      removeStoredValue(SUBMIT_FLOW_RESUME_KEY);
      return null;
    }

    return payload;
  } catch {
    removeStoredValue(SUBMIT_FLOW_RESUME_KEY);
    return null;
  }
}

export function clearSubmitFlowResume() {
  removeStoredValue(SUBMIT_FLOW_RESUME_KEY);
}

