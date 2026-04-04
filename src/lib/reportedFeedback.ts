import { FeedbackReportStatus } from "../types";

const REPORTED_FEEDBACK_STORAGE_PREFIX = "test4test:reported-feedback:";

function getReportedFeedbackStorageKey(userId: string) {
  return `${REPORTED_FEEDBACK_STORAGE_PREFIX}${userId}`;
}

export function loadReportedFeedbackResponseIds(userId: string) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const stored = window.localStorage.getItem(getReportedFeedbackStorageKey(userId));

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveReportedFeedbackResponseIds(userId: string, responseIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (responseIds.length === 0) {
      window.localStorage.removeItem(getReportedFeedbackStorageKey(userId));
      return;
    }

    window.localStorage.setItem(
      getReportedFeedbackStorageKey(userId),
      JSON.stringify(Array.from(new Set(responseIds))),
    );
  } catch {
    return;
  }
}

export function markReportedFeedbackResponseId(userId: string, responseId: string) {
  if (!userId || !responseId) {
    return;
  }

  const current = loadReportedFeedbackResponseIds(userId);

  if (current.includes(responseId)) {
    return;
  }

  saveReportedFeedbackResponseIds(userId, [...current, responseId]);
}

export function reconcileReportedFeedbackResponseIds(
  userId: string,
  items: Array<{ responseId: string; reportStatus: FeedbackReportStatus | null }>,
) {
  if (!userId) {
    return;
  }

  const current = loadReportedFeedbackResponseIds(userId);

  if (current.length === 0) {
    return;
  }

  const explicitStatuses = new Map(items.map((item) => [item.responseId, item.reportStatus]));
  const next = current.filter((responseId) => explicitStatuses.get(responseId) !== "resolved" && explicitStatuses.get(responseId) !== "dismissed");

  if (next.length !== current.length) {
    saveReportedFeedbackResponseIds(userId, next);
  }
}