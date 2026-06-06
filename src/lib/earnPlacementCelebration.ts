export const EARN_CREDIT_CELEBRATION_COPY =
  "Congrats, you earned 1 credit. Your test moved up on Earn.";

const EARN_PLACEMENT_SNAPSHOT_STORAGE_KEY = "test4test:earn-placement-snapshot";

export interface EarnPlacementSnapshot {
  ownerSubmissionId: string | null;
  previousWouldRank: number | null;
  previousWouldRankedSubmissionCount: number;
  capturedAt: string;
}

export interface EarnCreditCelebrationState {
  kind: "earned-credit";
  placementSnapshot: EarnPlacementSnapshot | null;
}

function isFiniteRank(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}

export function normalizeEarnPlacementSnapshot(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EarnPlacementSnapshot>;

  return {
    ownerSubmissionId:
      typeof candidate.ownerSubmissionId === "string" ? candidate.ownerSubmissionId : null,
    previousWouldRank: isFiniteRank(candidate.previousWouldRank)
      ? Math.round(candidate.previousWouldRank)
      : null,
    previousWouldRankedSubmissionCount:
      typeof candidate.previousWouldRankedSubmissionCount === "number" &&
      Number.isFinite(candidate.previousWouldRankedSubmissionCount)
        ? Math.max(0, Math.round(candidate.previousWouldRankedSubmissionCount))
        : 0,
    capturedAt:
      typeof candidate.capturedAt === "string"
        ? candidate.capturedAt
        : new Date().toISOString(),
  } satisfies EarnPlacementSnapshot;
}

export function saveEarnPlacementSnapshot(snapshot: EarnPlacementSnapshot | null) {
  if (!snapshot || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      EARN_PLACEMENT_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Session storage is a convenience for the handoff, not required for submitting a test.
  }
}

export function consumeEarnPlacementSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(EARN_PLACEMENT_SNAPSHOT_STORAGE_KEY);
    window.sessionStorage.removeItem(EARN_PLACEMENT_SNAPSHOT_STORAGE_KEY);

    return normalizeEarnPlacementSnapshot(rawValue ? JSON.parse(rawValue) : null);
  } catch {
    return null;
  }
}

export function parseEarnCreditCelebrationState(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EarnCreditCelebrationState>;

  if (candidate.kind !== "earned-credit") {
    return null;
  }

  return {
    kind: "earned-credit",
    placementSnapshot: normalizeEarnPlacementSnapshot(candidate.placementSnapshot),
  } satisfies EarnCreditCelebrationState;
}
