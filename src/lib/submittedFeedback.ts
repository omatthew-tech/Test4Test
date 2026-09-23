import { readStoredStarRating } from "./starRatings";
import {
  StarRating,
  FeedbackReportStatus,
  ProductType,
  SubmissionStatus,
  SubmittedFeedbackCard,
} from "../types";
import { normalizeProductTypes } from "./format";
import { requireSupabase } from "./supabase";

interface SubmittedFeedbackCardRpcRow {
  response_id: string;
  submission_id: string;
  product_name: string;
  product_types: ProductType[] | null;
  description: string | null;
  needs_google_play_closed_testers?: boolean | null;
  submitted_at: string;
  star_rating?: StarRating | null;
  rating_value?: string | null;
  owner_test_back_rate_percent: number | null;
  owner_satisfaction_rate_percent: number | null;
  submission_status: SubmissionStatus;
  report_status?: FeedbackReportStatus | null;
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeReportStatus(value: FeedbackReportStatus | null | undefined) {
  return value === "pending" || value === "resolved" || value === "dismissed" ? value : null;
}

export async function loadSubmittedFeedbackCards() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_my_submitted_feedback_cards");

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SubmittedFeedbackCardRpcRow[]).map((row) => ({
    responseId: row.response_id,
    submissionId: row.submission_id,
    productName: row.product_name,
    productTypes: normalizeProductTypes(Array.isArray(row.product_types) ? row.product_types : []),
    description: row.description ?? "",
    needsGooglePlayClosedTesters: row.needs_google_play_closed_testers === true,
    submittedAt: row.submitted_at,
    starRating:
      row.star_rating == null && row.rating_value == null
        ? null
        : readStoredStarRating(row.star_rating, row.rating_value),
    ownerTestBackRatePercent: normalizePercent(row.owner_test_back_rate_percent),
    ownerSatisfactionRatePercent: normalizePercent(row.owner_satisfaction_rate_percent),
    ownerAvatarUrl: null,
    submissionStatus: row.submission_status,
    reportStatus: normalizeReportStatus(row.report_status),
  })) satisfies SubmittedFeedbackCard[];
}
