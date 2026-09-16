import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "../../src/context/AppStateContext";
import { getStoredOtpChallenge } from "../../src/lib/pendingSubmission";
import { AUTH_UNAVAILABLE_MESSAGE } from "../../src/lib/authTransport";

const backend = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn() }));
vi.mock("../../src/lib/analytics", () => ({
  trackAuthenticatedVisit: vi.fn(),
  trackEvent: vi.fn(),
}));
vi.mock("../../src/lib/supabase", () => ({
  hasSupabaseConfig: true,
  isTestAccountEmail: () => false,
  requireSupabase: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: backend.send,
      verifyOtp: backend.verify,
    },
  }),
}));

let app: ReturnType<typeof useAppState>;
function Probe() {
  app = useAppState();
  return <output>{app.isLoading ? "loading" : "ready"}</output>;
}
async function mount() {
  render(
    <MemoryRouter initialEntries={["/sign-in"]}>
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    </MemoryRouter>,
  );
  await screen.findByText("ready");
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  backend.send.mockReset();
  backend.verify.mockReset();
});
afterEach(cleanup);

it("does not save a failed send as a challenge and allows a fresh user retry", async () => {
  backend.send
    .mockResolvedValueOnce({
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
    })
    .mockResolvedValueOnce({ error: null });
  await mount();
  await act(async () => {
    await expect(app.requestOtp("member@example.test", { intent: "sign_in" })).rejects.toThrow(
      AUTH_UNAVAILABLE_MESSAGE,
    );
  });
  expect(app.state.otpChallenge).toBeNull();
  expect(getStoredOtpChallenge()).toBeNull();
  await act(async () => {
    await app.requestOtp("member@example.test", { intent: "sign_in" });
  });
  expect(app.state.otpChallenge?.email).toBe("member@example.test");
  expect(backend.send).toHaveBeenCalledTimes(2);
  expect(backend.send).toHaveBeenLastCalledWith({
    email: "member@example.test",
    options: { shouldCreateUser: false },
  });
});

it("retains the challenge after a verification outage without resending or signing in", async () => {
  backend.send.mockResolvedValue({ error: null });
  backend.verify.mockResolvedValue({
    data: {},
    error: { name: "AuthRetryableFetchError", message: "Gateway Timeout", status: 504 },
  });
  await mount();
  await act(async () => {
    await app.requestOtp("member@example.test", { intent: "sign_in" });
  });
  await act(async () => {
    expect(await app.verifyOtp("123456")).toEqual({ ok: false, message: AUTH_UNAVAILABLE_MESSAGE });
  });
  expect(app.state.otpChallenge?.email).toBe("member@example.test");
  expect(app.currentUser).toBeNull();
  expect(backend.send).toHaveBeenCalledTimes(1);
});
