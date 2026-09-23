import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuyCreditsPage } from "../../src/pages/BuyCreditsPage";

const mocks = vi.hoisted(() => ({ create: vi.fn(), status: vi.fn() }));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../src/lib/creditPurchases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/creditPurchases")>()),
  creditCheckoutEnabled: () => true,
  createCreditCheckout: mocks.create,
  getCreditPurchase: mocks.status,
}));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Buy credits checkout", () => {
  it("prevents concurrent starts and reuses the purchase ID after a transport failure", async () => {
    let reject: (error: Error) => void = () => {};
    mocks.create.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    render(
      <MemoryRouter>
        <BuyCreditsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Buy 3 credits" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy 1 credit" }));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Network unavailable")));
    expect((await screen.findByRole("alert")).textContent).toContain("Network unavailable");
    mocks.create.mockRejectedValue(new Error("Still unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Buy 3 credits" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it("uses server purchase status rather than treating a redirect as proof of payment", async () => {
    mocks.status.mockResolvedValue({
      status: "paid",
      credits: 3,
      credits_granted: true,
      review_required: false,
    });
    render(
      <MemoryRouter initialEntries={["/buy-credits?purchase=83000000-0000-4000-8000-000000000001"]}>
        <BuyCreditsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("3 credits have been added to your account.")).not.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("shows a retryable error for an unverified purchase", async () => {
    mocks.status.mockRejectedValue(new Error("Purchase unavailable"));
    render(
      <MemoryRouter initialEntries={["/buy-credits?purchase=untrusted"]}>
        <BuyCreditsPage />
      </MemoryRouter>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Purchase unavailable");
    expect(screen.getByRole("button", { name: "Check payment status" })).not.toBeNull();
    expect(screen.queryByText(/been added/)).toBeNull();
  });
});
