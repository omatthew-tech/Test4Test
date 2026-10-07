import { expect, it } from "vitest";
import { seededState } from "../../src/data/seeds";
import { getAvailableSubmissions } from "../../src/lib/selectors";
import type { AppState } from "../../src/types";

it("preserves eligibility, promotion, response count, and date ordering without mutating inputs", () => {
  const base = seededState.submissions[0];
  const state: AppState = {
    ...seededState,
    currentUserId: "tester",
    submissions: [
      { ...base, id: "older", createdAt: "2026-01-01", responseCount: 0 },
      { ...base, id: "newer", createdAt: "2026-02-01", responseCount: 0 },
      { ...base, id: "popular", responseCount: 5 },
      { ...base, id: "promoted", promoted: true, responseCount: 10 },
      { ...base, id: "own", userId: "tester" },
      { ...base, id: "closed", isOpenForMoreTests: false },
      { ...base, id: "draft", status: "draft" },
      { ...base, id: "completed" },
    ],
    responses: [
      { ...seededState.responses[0], submissionId: "completed", testerUserId: "tester" },
      { ...seededState.responses[0], submissionId: "older", testerUserId: "another-tester" },
    ],
  };
  // Make fixture defaults explicit so unrelated product fixture edits cannot change eligibility.
  state.submissions = state.submissions.map((submission) => ({
    ...submission,
    userId: submission.id === "own" ? "tester" : "founder",
    promoted: submission.id === "promoted",
    status: submission.id === "draft" ? "draft" : "live",
    isOpenForMoreTests: submission.id !== "closed",
  }));
  const before = structuredClone(state);
  expect(getAvailableSubmissions(state).map((submission) => submission.id)).toEqual([
    "promoted",
    "newer",
    "older",
    "popular",
  ]);
  expect(state).toEqual(before);
});

it("preserves anonymous completion and ownership matching", () => {
  const base = seededState.submissions[0];
  const state = {
    ...seededState,
    currentUserId: null,
    submissions: [
      {
        ...base,
        id: "available",
        userId: "owner",
        status: "live" as const,
        isOpenForMoreTests: true,
      },
      {
        ...base,
        id: "completed",
        userId: "owner",
        status: "live" as const,
        isOpenForMoreTests: true,
      },
      { ...base, id: "unowned", userId: null, status: "live" as const, isOpenForMoreTests: true },
    ],
    responses: [{ ...seededState.responses[0], testerUserId: null, submissionId: "completed" }],
  };
  expect(getAvailableSubmissions(state).map((submission) => submission.id)).toEqual(["available"]);
});
