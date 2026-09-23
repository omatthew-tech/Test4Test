import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { SubmissionsPage } from "../../src/pages/SubmissionsPage";
import { createStarRatingCards } from "../../src/testing/starRatingFixtures";

const backend = vi.hoisted(() => ({ cards: vi.fn() }));
vi.mock("../../src/lib/submittedFeedback", () => ({ loadSubmittedFeedbackCards: backend.cards }));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({
    state: seededState,
    currentUser: seededState.users[1],
    isConfigured: true,
  }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Surface: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../../src/lib/submissionFavorites", () => ({
  loadSubmissionFavoriteResponseIds: async () => [],
  addSubmissionFavorite: vi.fn(),
  removeSubmissionFavorite: vi.fn(),
  syncSubmissionFavorites: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  backend.cards.mockReset();
});
afterEach(cleanup);

const mount = () =>
  render(
    <MemoryRouter>
      <SubmissionsPage />
    </MemoryRouter>,
  );

it("shows a loading failure without claiming reviews or favorites are empty", async () => {
  backend.cards.mockRejectedValue(new Error("A valid rating from 1 to 5 stars is required."));
  mount();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Your submitted tests could not be loaded",
  );
  expect(screen.queryByText("No submitted tests yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("No favorite submissions yet")).toBeNull();
  expect(screen.queryByText("A valid rating from 1 to 5 stars is required.")).toBeNull();
});

it("shows empty states only after a successful load", async () => {
  backend.cards.mockResolvedValue([]);
  mount();
  expect(await screen.findByText("No submitted tests yet")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
  expect(screen.getByText("No favorite submissions yet")).toBeTruthy();
});

it("opens each submitted test's founder conversation using its response", async () => {
  const cards = createStarRatingCards();
  backend.cards.mockResolvedValue([
    cards[0],
    { ...cards[1], submissionId: "without-conversation" },
  ]);
  mount();
  expect(
    (await screen.findByRole("link", { name: "Message about 5-star recording" })).getAttribute(
      "href",
    ),
  ).toBe(`/messages?response=${cards[0].responseId}`);
  expect(
    screen.getByRole("link", { name: "Message about Unrated recording" }).getAttribute("href"),
  ).toBe(`/messages?response=${cards[1].responseId}`);
});
