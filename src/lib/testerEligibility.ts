import type { TesterEarnAccessSummary } from "../types";

interface EligibilityResponse {
  id: string;
  testerUserId?: string | null;
  status: string;
  creditAwarded: boolean;
}

interface EligibilityRating {
  testResponseId: string;
  starRating?: number | null;
}

export function calculateTesterEarnAccess(
  testerUserId: string,
  responses: EligibilityResponse[],
  ratings: EligibilityRating[],
): TesterEarnAccessSummary {
  const creditedResponseIds = new Set(
    responses
      .filter(
        (response) =>
          response.testerUserId === testerUserId &&
          response.status === "approved" &&
          response.creditAwarded,
      )
      .map((response) => response.id),
  );
  const fiveStarResponseIds = new Set(
    ratings
      .filter((rating) => rating.starRating === 5 && creditedResponseIds.has(rating.testResponseId))
      .map((rating) => rating.testResponseId),
  );

  return {
    completedCreditTests: creditedResponseIds.size,
    fiveStarRatings: fiveStarResponseIds.size,
    paidAccessUnlocked: creditedResponseIds.size >= 2 && fiveStarResponseIds.size >= 2,
  };
}
