import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { EarnPage } from "../../src/pages/EarnPage";
import type { EarnSubmissionReputation, EarnVisibilitySummary, Submission } from "../../src/types";

const backend = vi.hoisted(() => ({
  guest: false,
  summary: vi.fn<() => Promise<EarnVisibilitySummary>>(),
  submissions: vi.fn<() => Promise<Submission[]>>(),
  reputations: vi.fn<() => Promise<EarnSubmissionReputation[]>>(),
  scrollIntoView: vi.fn(),
}));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({
    state: seededState,
    currentUser: backend.guest ? null : seededState.users[1],
    isConfigured: true,
    listEarnSubmissions: backend.submissions,
  }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../src/lib/earnVisibility", () => ({
  loadEarnVisibilitySummary: backend.summary,
}));
vi.mock("../../src/lib/earnReputation", () => ({
  loadEarnSubmissionReputations: backend.reputations,
}));
vi.mock("../../src/lib/earnPlatformPreferences", () => ({
  loadEarnPlatformPreferences: async () => ({ confirmed: true, productTypes: ["website"] }),
}));
vi.mock("../../src/lib/testReports", () => ({
  loadMySubmissionReportStatuses: async () => [],
}));
vi.mock("../../src/lib/testResponseDrafts", () => ({
  loadTestResponseDraftProgress: async () => ({}),
}));
vi.mock("../../src/lib/submittedFeedback", () => ({
  loadSubmittedFeedbackCards: async () => [],
}));

const newOwnerSummary: EarnVisibilitySummary = {
  submissionId: "submission-palette",
  productName: "Palette Pilot",
  hasCompletedTest: false,
  rank: 2,
  rankAfterOneCredit: 1,
  rankedSubmissionCount: 3,
  wouldRank: 2,
  wouldRankedSubmissionCount: 3,
  tokenBalance: 0,
  testBackRatePercent: 100,
  satisfactionRatePercent: 100,
};
const availableTest = seededState.submissions.find((item) => item.id === "submission-pantry")!;
const metric = (label: string) =>
  screen.getByText(label, { exact: true }).parentElement?.querySelector("strong")?.textContent;

async function mount() {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={["/earn"]}>
        <EarnPage />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  backend.guest = false;
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  backend.summary.mockReset().mockResolvedValue({ ...newOwnerSummary });
  backend.submissions.mockReset().mockResolvedValue([availableTest]);
  backend.reputations.mockReset().mockResolvedValue([]);
  backend.scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: backend.scrollIntoView,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows the first-credit announcement above a new owner's summary with a dismiss action", async () => {
  await mount();
  const announcement = screen.getByRole("status");
  expect(announcement.textContent).toBe(
    "Welcome to Test4Test! Increase your test's rank by 1 rank when you complete any test below",
  );
  expect(announcement.nextElementSibling?.textContent).toContain("Palette Pilot");
  expect(announcement.querySelectorAll("button")).toHaveLength(1);
  expect(announcement.querySelector("a")).toBeNull();
  expect(screen.getByText("#2", { exact: false })).toBeTruthy();
  expect(metric("Credits")).toBe("--");
  expect(metric("Test-back rate")).toBe("--");
  expect(metric("Satisfaction rate")).toBe("--");
  expect(screen.queryByText("Your app isn't listed yet...")).toBeNull();
  expect(screen.queryByRole("button", { name: "Complete a test" })).toBeNull();
  expect(screen.queryByText(/Only visible to you|Private preview of where/)).toBeNull();
  expect(screen.getByText("Your app")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View analytics" }).getAttribute("href")).toBe(
    "/analytics",
  );
  expect(screen.getByRole("link", { name: "View test" }).getAttribute("href")).toBe(
    "/test/submission-pantry",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Dismiss welcome announcement" }));
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
  expect(screen.getByText("#2", { exact: false })).toBeTruthy();
  expect(backend.summary).toHaveBeenCalledTimes(1);
});

it("uses credit placeholders until testing history exists, even with no available tests", async () => {
  backend.summary.mockResolvedValue({ ...newOwnerSummary, tokenBalance: 4 });
  backend.submissions.mockResolvedValue([]);
  await mount();
  expect(metric("Credits")).toBe("--");
  expect(metric("Test-back rate")).toBe("--");
  expect(screen.getByText("#2", { exact: false })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Complete a test" })).toBeNull();
});

it("shows the original B experience and scrolls to an available test without showing the welcome message", async () => {
  backend.summary.mockResolvedValue({
    ...newOwnerSummary,
    experimentKey: "earn_activation_v1",
    experimentVariant: "B",
    listingLocked: true,
    rank: null,
    rankAfterOneCredit: null,
  });
  await mount();
  expect(screen.getByText("Your app isn't listed yet...")).toBeTruthy();
  expect(screen.getByText("Only visible to you")).toBeTruthy();
  expect(screen.getByText(/Private preview of where/)).toBeTruthy();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
  expect(metric("Credits")).toBe("--");
  await userEvent.setup().click(screen.getByRole("button", { name: "Complete a test" }));
  expect(backend.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  expect(document.activeElement?.textContent).toContain("Pocket Pantry");
});

it("explains when B has no available tests and does not leak unfiltered local apps after a server error", async () => {
  backend.summary.mockResolvedValue({
    ...newOwnerSummary,
    listingLocked: true,
    rank: null,
    rankAfterOneCredit: null,
  });
  backend.submissions.mockRejectedValue(new Error("Earn is temporarily unavailable"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  await mount();
  expect(
    (screen.getByRole("button", { name: "Complete a test" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText("No available tests match your filters right now.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "View test" })).toBeNull();
});

it("keeps unfiltered local apps hidden while a configured listing request is pending", async () => {
  backend.submissions.mockImplementation(() => new Promise(() => {}));
  await mount();
  expect(screen.queryByRole("link", { name: "View test" })).toBeNull();
});

it("does not expose local apps to guests in a configured environment", async () => {
  backend.guest = true;
  await mount();
  expect(screen.queryByRole("link", { name: "View test" })).toBeNull();
  expect(backend.submissions).not.toHaveBeenCalled();
});

it("preserves Improve rate scrolling and focus for owners with testing history", async () => {
  backend.summary.mockResolvedValue({
    ...newOwnerSummary,
    hasCompletedTest: true,
    testBackRatePercent: 80,
  });
  backend.reputations.mockResolvedValue([
    {
      submissionId: availableTest.id,
      ownerHasTestedYou: true,
      ownerHasCompletedTest: true,
      ownerCreditBalance: 1,
      ownerTestBackRatePercent: 100,
      ownerSatisfactionRatePercent: 100,
      ownerAvatarUrl: null,
    },
  ]);
  await mount();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
  expect(metric("Credits")).toBe("0");
  expect(metric("Test-back rate")).toBe("80%");
  expect(metric("Satisfaction rate")).toBe("100%");
  const improve = screen.getByRole("button", { name: "Improve rate" });
  await waitFor(() => expect((improve as HTMLButtonElement).disabled).toBe(false));
  await userEvent.setup().click(improve);
  expect(backend.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  expect(document.activeElement?.textContent).toContain("Pocket Pantry");
});

it("keeps the no-live-app state rather than claiming every account has a listing", async () => {
  backend.summary.mockResolvedValue({
    ...newOwnerSummary,
    submissionId: null,
    productName: null,
    rank: null,
    wouldRank: null,
  });
  await mount();
  expect(screen.getByRole("link", { name: "Submit app" }).getAttribute("href")).toBe("/submit");
  expect(screen.getByText("Submit an app to earn a Rank")).toBeTruthy();
  expect(screen.queryByText("Your app")).toBeNull();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
});

it("does not invent a rank while the summary is loading or unavailable", async () => {
  let resolveSummary!: (summary: EarnVisibilitySummary) => void;
  backend.summary.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSummary = resolve;
      }),
  );
  await mount();
  expect(screen.getByText("Loading Rank")).toBeTruthy();
  expect(metric("Credits")).toBe("...");
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
  await act(async () => resolveSummary({ ...newOwnerSummary, rank: null, wouldRank: null }));
  expect(screen.getByText("Not visible on Earn right now")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Complete a test" })).toBeNull();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
});

it.each([
  [5, 2, "3 ranks"],
  [1, 1, "0 ranks"],
])("shows the calculated movement for rank %s to %s", async (rank, rankAfterOneCredit, gain) => {
  backend.summary.mockResolvedValue({ ...newOwnerSummary, rank, rankAfterOneCredit });
  await mount();
  expect(screen.getByRole("status").textContent).toContain(`rank by ${gain} when`);
});

it("does not invent an estimate when the server has no projection", async () => {
  backend.summary.mockResolvedValue({ ...newOwnerSummary, rankAfterOneCredit: null });
  await mount();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
});

it("removes the announcement after the first credited test and keeps it hidden on later visits", async () => {
  await mount();
  expect(screen.getByText("Welcome to Test4Test!")).toBeTruthy();
  cleanup();
  backend.summary.mockResolvedValue({
    ...newOwnerSummary,
    hasCompletedTest: true,
    tokenBalance: 1,
  });
  await mount();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
  cleanup();
  backend.summary.mockResolvedValue({
    ...newOwnerSummary,
    hasCompletedTest: true,
    tokenBalance: 0,
  });
  await mount();
  expect(screen.queryByText("Welcome to Test4Test!")).toBeNull();
});
