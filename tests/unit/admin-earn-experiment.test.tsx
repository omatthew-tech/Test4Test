import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminEarnExperiment } from "../../src/pages/AdminEarnExperiment";
import { earnExperimentFixture } from "../../src/testing/earnExperimentFixture";

const backend = vi.hoisted(() => ({ manage: vi.fn() }));
vi.mock("../../src/lib/earnExperiment", () => ({ manageEarnExperiment: backend.manage }));
beforeEach(() => {
  backend.manage.mockReset().mockResolvedValue(earnExperimentFixture);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

it("shows aggregate totals, elapsed times and sources without participant rows or a declared winner", async () => {
  render(<AdminEarnExperiment />);
  const table = await screen.findByRole("table", {
    name: "First credited test completion by version",
  });
  expect(within(table).getByText("50%")).toBeTruthy();
  expect(within(table).getByText("1.2 hr")).toBeTruthy();
  expect(screen.getByText("A minus B: +10.00 percentage points.")).toBeTruthy();
  expect(
    screen.getByRole("table", { name: "Arrival source on the completion visit" }).textContent,
  ).toContain("Feedback email");
  expect(screen.queryByText(/winner|@example.com/i)).toBeNull();
});

it("requires explicit End confirmation and uses the server's frozen result", async () => {
  render(<AdminEarnExperiment />);
  await screen.findByRole("table", { name: "First credited test completion by version" });
  await userEvent.setup().click(screen.getByRole("button", { name: "End experiment" }));
  expect(backend.manage).toHaveBeenCalledTimes(1);
  const dialog = screen.getByRole("dialog", { name: "End the Earn experiment?" });
  backend.manage.mockResolvedValue({
    ...earnExperimentFixture,
    status: "ended",
    endedAt: earnExperimentFixture.asOf,
  });
  await userEvent
    .setup()
    .click(within(dialog).getByRole("button", { name: "End and freeze results" }));
  await waitFor(() => expect(backend.manage).toHaveBeenLastCalledWith("end"));
  await waitFor(() => expect(screen.queryByRole("button", { name: "End experiment" })).toBeNull());
});

it("handles empty results and exposes start and resume controls without a fabricated rate", async () => {
  backend.manage.mockResolvedValue({
    ...earnExperimentFixture,
    status: "draft",
    startedAt: null,
    sources: [],
    variants: earnExperimentFixture.variants.map((row) => ({
      ...row,
      assigned: 0,
      exposed: 0,
      completed: 0,
      unexposed: 0,
      notCompleted: 0,
      completionPercent: null,
      medianSeconds: null,
    })),
  });
  render(<AdminEarnExperiment />);
  await screen.findByRole("button", { name: "Start experiment" });
  expect(screen.getByText(/difference will appear/)).toBeTruthy();
  backend.manage.mockResolvedValue({ ...earnExperimentFixture, status: "paused" });
  await userEvent.setup().click(screen.getByRole("button", { name: "Start experiment" }));
  await screen.findByRole("button", { name: "Resume enrollment" });
});

it("shows an access error without exposing controls or retained report data", async () => {
  backend.manage.mockRejectedValue(new Error("You do not have admin access."));
  render(<AdminEarnExperiment />);
  await screen.findByText("You do not have admin access.");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("button", { name: "Start experiment" })).toBeNull();
});
