import type { StarRating, SubmittedFeedbackCard } from "../types";

export function isStarRating(value: unknown): value is StarRating {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function readStarRating(value: unknown): StarRating {
  if (!isStarRating(value)) throw new Error("A valid rating from 1 to 5 stars is required.");
  return value;
}

export function isRevisionRating(value: unknown): value is 1 | 2 | 3 | 4 {
  return isStarRating(value) && value < 5;
}

export function canReportRating(card: Pick<SubmittedFeedbackCard, "starRating" | "reportStatus">) {
  return isRevisionRating(card.starRating) && card.reportStatus !== "pending";
}

export function canReviseFeedback(
  card: Pick<SubmittedFeedbackCard, "starRating" | "reportStatus" | "submissionStatus">,
) {
  return card.submissionStatus === "live" && canReportRating(card);
}

export function compareSubmittedRatings(
  first: SubmittedFeedbackCard,
  second: SubmittedFeedbackCard,
) {
  const priority = (card: SubmittedFeedbackCard) =>
    isRevisionRating(card.starRating) ? card.starRating : 5;
  return (
    priority(first) - priority(second) ||
    Date.parse(second.submittedAt) - Date.parse(first.submittedAt)
  );
}
