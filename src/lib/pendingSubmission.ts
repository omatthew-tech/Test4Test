import { Question, SubmissionDraft } from "../types";

const PENDING_SUBMISSION_PREFIX = "test4test-pending-submission:";
const OTP_CHALLENGE_KEY = "test4test-otp-challenge";

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

function isBrowser() {
  return typeof window !== "undefined";
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

  window.sessionStorage.setItem(
    `${PENDING_SUBMISSION_PREFIX}${payload.id}`,
    JSON.stringify(payload),
  );
}

export function getPendingSubmission(id: string) {
  if (!isBrowser()) {
    return null;
  }

  const stored = window.sessionStorage.getItem(`${PENDING_SUBMISSION_PREFIX}${id}`);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as PendingSubmissionPayload;
  } catch {
    return null;
  }
}

export function clearPendingSubmission(id: string) {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(`${PENDING_SUBMISSION_PREFIX}${id}`);
}

export function storeOtpChallenge(challenge: StoredOtpChallenge) {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(OTP_CHALLENGE_KEY, JSON.stringify(challenge));
}

export function getStoredOtpChallenge() {
  if (!isBrowser()) {
    return null;
  }

  const stored = window.sessionStorage.getItem(OTP_CHALLENGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as StoredOtpChallenge;
  } catch {
    return null;
  }
}

export function clearStoredOtpChallenge() {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(OTP_CHALLENGE_KEY);
}
