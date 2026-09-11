import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppShell } from "../../src/components/Layout";

const account = vi.hoisted(() => ({
  currentUser: { id: "member", accountType: "founder" },
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../src/context/AppStateContext", () => ({
  useAccountState: () => account,
  useAppActions: () => account,
}));

function Location() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderShell() {
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <AppShell>
        <Location />
      </AppShell>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.currentUser.accountType = "founder";
  account.signOut.mockReset();
  account.signOut.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("profile menu sign out", () => {
  it.each([
    ["founder", "/"],
    ["tester", "/get-paid-to-test"],
  ])(
    "uses the existing action and redirects %s accounts to %s",
    async (accountType, destination) => {
      account.currentUser.accountType = accountType;
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByRole("button", { name: "Profile menu" }));
      await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Current path").textContent).toBe(destination),
      );
      expect(account.signOut).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).toBeNull();
    },
  );

  it("prevents duplicate sign-out attempts while the action is pending", async () => {
    let complete!: () => void;
    account.signOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    const pending = screen.getByRole("menuitem", { name: "Signing out..." });
    expect(pending.hasAttribute("disabled")).toBe(true);
    await user.click(pending);
    expect(account.signOut).toHaveBeenCalledTimes(1);
    complete();
    await waitFor(() => expect(screen.getByLabelText("Current path").textContent).toBe("/"));
  });

  it("shows a recoverable error and allows another attempt", async () => {
    account.signOut.mockRejectedValueOnce(new Error("Network unavailable"));
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We couldn't sign you out. Please try again.",
    );
    expect(screen.getByLabelText("Current path").textContent).toBe("/profile");
    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByLabelText("Current path").textContent).toBe("/"));
    expect(account.signOut).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
