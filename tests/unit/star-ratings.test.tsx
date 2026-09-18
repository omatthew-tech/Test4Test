import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { StarRatingDisplay } from "@test4test/design-system";
import {
  canReportRating,
  canReviseFeedback,
  compareSubmittedRatings,
  readStarRating,
} from "../../src/lib/starRatings";
import { SubmissionFeedbackRow } from "../../src/pages/SubmissionsPage";
import type { StarRating, SubmittedFeedbackCard } from "../../src/types";

afterEach(cleanup);
const card = (
  starRating: StarRating | null,
  overrides: Partial<SubmittedFeedbackCard> = {},
): SubmittedFeedbackCard => ({
  responseId: String(starRating),
  submissionId: "app",
  productName: "Example",
  productTypes: ["website"],
  description: "Test feedback",
  needsGooglePlayClosedTesters: false,
  submittedAt: "2026-09-17T12:00:00Z",
  starRating,
  ownerTestBackRatePercent: 100,
  ownerSatisfactionRatePercent: 100,
  submissionStatus: "live",
  reportStatus: null,
  ...overrides,
});

it.each([1, 2, 3, 4, 5] as const)(
  "displays %s stars with one accessible label and no interactive controls",
  (value) => {
    const { container } = render(<StarRatingDisplay value={value} />);
    expect(screen.getByRole("img", { name: `${value} out of 5 stars` })).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(5);
    expect(container.querySelectorAll("button, input, [tabindex]")).toHaveLength(0);
  },
);

it.each([1, 2, 3, 4, 5, null] as const)(
  "uses the same eligibility for %s stars across statuses",
  (stars) => {
    expect(canReportRating(card(stars))).toBe(stars !== null && stars < 5);
    expect(canReviseFeedback(card(stars))).toBe(stars !== null && stars < 5);
    expect(canReviseFeedback(card(stars, { submissionStatus: "paused" }))).toBe(false);
    expect(canReportRating(card(stars, { submissionStatus: "paused" }))).toBe(
      stars !== null && stars < 5,
    );
    expect(canReportRating(card(stars, { reportStatus: "pending" }))).toBe(false);
    expect(canReviseFeedback(card(stars, { reportStatus: "pending" }))).toBe(false);
  },
);

it("orders 1–4 ascending, newest within a score, then five-star and unrated by date", () => {
  const cards = [
    card(5),
    card(3),
    card(null, { submittedAt: "2026-09-18T12:00:00Z" }),
    card(2),
    card(4),
    card(1),
    card(2, { responseId: "newer", submittedAt: "2026-09-18T12:00:00Z" }),
  ];
  expect(cards.sort(compareSubmittedRatings).map((c) => c.responseId)).toEqual([
    "1",
    "newer",
    "2",
    "3",
    "4",
    "null",
    "5",
  ]);
});

it.each([0, 6, 2.5, NaN, "3", undefined, null])("rejects invalid stored stars %s", (value) => {
  expect(() => readStarRating(value)).toThrow("1 to 5");
});

it.each([
  [card(2), "Revise Feedback"],
  [card(4, { reportStatus: "pending" }), "Report in progress"],
  [card(3, { submissionStatus: "paused" }), "Test closed"],
  [card(5, { submissionStatus: "paused" }), "Test closed"],
  [card(null), "Not rated"],
] as const)("keeps rating visible independently of status %#", (value, status) => {
  render(
    <MemoryRouter>
      <SubmissionFeedbackRow
        card={value}
        isFavorite={false}
        isFavoritePending={false}
        primaryAccessUrl={null}
        onToggleFavorite={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText(status)).toBeTruthy();
  if (value.starRating)
    expect(screen.getByRole("img", { name: `${value.starRating} out of 5 stars` })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /favorites/ }) !== null).toBe(
    value.starRating === null || value.starRating === 5,
  );
});
