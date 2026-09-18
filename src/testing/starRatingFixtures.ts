import type { SubmittedFeedbackCard } from "../types";

export function createStarRatingCards(): SubmittedFeedbackCard[] {
  return ([5, null, 4, 2, 1, 3] as const).map((starRating) => ({
    responseId: `star-fixture-${starRating ?? "unrated"}`,
    submissionId: "palette-pilot",
    productName: starRating === null ? "Unrated recording" : `${starRating}-star recording`,
    productTypes: ["website"],
    description: "Feedback from a completed usability test.",
    needsGooglePlayClosedTesters: false,
    submittedAt: "2026-09-17T12:00:00Z",
    starRating,
    ownerTestBackRatePercent: 100,
    ownerSatisfactionRatePercent: 80,
    submissionStatus: starRating === 4 ? "paused" : "live",
    reportStatus: starRating === 3 ? "pending" : null,
  }));
}
