import { beforeEach, expect, it, vi } from "vitest";
import { loadSubmittedFeedbackCards } from "../../src/lib/submittedFeedback";

const database = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => database }));

const row = (rating: Record<string, unknown>) => ({
  response_id: "response",
  submission_id: "submission",
  product_name: "Existing app",
  product_types: ["website"],
  submitted_at: "2026-09-01T12:00:00Z",
  submission_status: "live",
  ...rating,
});

beforeEach(() => database.rpc.mockReset());

it("loads mixed legacy, exact-star and unrated reviews without dropping the list", async () => {
  database.rpc.mockResolvedValue({
    data: [
      row({ rating_value: "frowny" }),
      row({ star_rating: null, rating_value: "neutral" }),
      row({ rating_value: "smiley" }),
      row({ star_rating: 2, rating_value: "smiley" }),
      row({ star_rating: 4, rating_value: "frowny" }),
      row({ star_rating: 5, rating_value: null }),
      row({ rating_value: null }),
      row({ star_rating: null, rating_value: null }),
    ],
    error: null,
  });
  expect((await loadSubmittedFeedbackCards()).map((card) => card.starRating)).toEqual([
    1,
    3,
    5,
    2,
    4,
    5,
    null,
    null,
  ]);
  expect(database.rpc).toHaveBeenCalledWith("get_my_submitted_feedback_cards");
});

it.each([0, 6, 2.5, "3"])(
  "rejects a corrupt explicit score %s instead of replacing it",
  async (value) => {
    database.rpc.mockResolvedValue({
      data: [row({ star_rating: value, rating_value: "smiley" })],
      error: null,
    });
    await expect(loadSubmittedFeedbackCards()).rejects.toThrow("1 to 5");
  },
);

it("rejects an unknown legacy score rather than inventing a rating", async () => {
  database.rpc.mockResolvedValue({ data: [row({ rating_value: "unknown" })], error: null });
  await expect(loadSubmittedFeedbackCards()).rejects.toThrow("1 to 5");
});

it("keeps backend failures distinct from an empty list", async () => {
  database.rpc.mockResolvedValue({ data: null, error: { message: "Service unavailable" } });
  await expect(loadSubmittedFeedbackCards()).rejects.toThrow("Service unavailable");
  database.rpc.mockResolvedValue({ data: [], error: null });
  expect(await loadSubmittedFeedbackCards()).toEqual([]);
});
