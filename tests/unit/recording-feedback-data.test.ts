import type { StarRating } from "../../src/types";
import { beforeEach, expect, it, vi } from "vitest";
import {
  loadRecordingRating,
  recordingPaymentLinks,
  saveRecordingRating,
} from "../../src/lib/recordingFeedback";

const database = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => database }));
beforeEach(() => {
  vi.clearAllMocks();
  database.from.mockReturnValue(database);
  database.upsert.mockReturnValue(database);
  database.delete.mockReturnValue(database);
  database.select.mockReturnValue(database);
  database.eq.mockReturnValue(database);
});

it("loads exact persisted stars independently of legacy audit values", async () => {
  database.maybeSingle.mockResolvedValue({
    data: { star_rating: 4, rating_value: "smiley" },
    error: null,
  });
  expect(await loadRecordingRating("response", "owner")).toBe(4);
  expect(database.eq.mock.calls).toEqual([
    ["test_response_id", "response"],
    ["rated_by_user_id", "owner"],
  ]);
});

it("persists exact stars without writing legacy audit values", async () => {
  database.select.mockResolvedValue({ data: [{ id: "saved" }], error: null });
  await saveRecordingRating("response", "owner", 4);
  expect(database.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      test_response_id: "response",
      rated_by_user_id: "owner",
      star_rating: 4,
    }),
    { onConflict: "test_response_id,rated_by_user_id" },
  );
  expect(database.upsert.mock.calls[0][0]).not.toHaveProperty("rating_value");
});

it("loads a legacy rating while the exact-star migration is pending", async () => {
  database.maybeSingle.mockResolvedValue({
    data: { star_rating: null, rating_value: "neutral" },
    error: null,
  });
  expect(await loadRecordingRating("response", "owner")).toBe(3);
  expect(database.select).toHaveBeenCalledWith("star_rating, rating_value");
});

it("does not report a silently denied delete as success", async () => {
  database.select.mockResolvedValue({ data: [], error: null });
  await expect(saveRecordingRating("response", "owner", null)).rejects.toThrow(
    "could not be cleared",
  );
  expect(database.eq.mock.calls).toEqual([
    ["test_response_id", "response"],
    ["rated_by_user_id", "owner"],
  ]);
});

it.each([0, 6, 2.5, NaN])(
  "rejects invalid rating %s before contacting the backend",
  async (value) => {
    await expect(saveRecordingRating("response", "owner", value as StarRating)).rejects.toThrow(
      "1 to 5",
    );
    expect(database.from).not.toHaveBeenCalled();
  },
);

it("builds supported payment links and rejects unsafe destinations", () => {
  expect(
    recordingPaymentLinks({
      paypalHandle: "paypal.me/tester",
      venmoHandle: "@tester",
      cashAppHandle: "$tester",
    }),
  ).toEqual([
    { label: "PayPal", url: "https://paypal.me/tester" },
    { label: "Venmo", url: "https://venmo.com/tester" },
    { label: "Cash App", url: "https://cash.app/$tester" },
  ]);
  expect(
    recordingPaymentLinks({
      paypalHandle: "javascript:alert(1)",
      venmoHandle: "https://venmo.com.evil.test/",
      cashAppHandle: "https://user@cash.app/tester",
    }),
  ).toEqual([]);
});
