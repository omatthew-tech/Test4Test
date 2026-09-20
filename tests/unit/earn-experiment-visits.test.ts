import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type * as Visits from "../../src/lib/earnExperimentVisits";

let visits: typeof Visits;
beforeEach(async () => {
  sessionStorage.clear();
  vi.resetModules();
  visits = await import("../../src/lib/earnExperimentVisits");
  window.history.replaceState({}, "", "/earn");
  Object.defineProperty(document, "referrer", { configurable: true, value: "" });
});
afterEach(() => vi.useRealTimers());

it("retains a feedback-email source through sign-in, navigation and a reload", async () => {
  window.history.replaceState({}, "", "/analytics?earn_entry=feedback_email&response=abc");
  const first = visits.currentEarnVisit();
  expect(first.source).toBe("feedback_email");
  expect(window.location.search).toBe("?response=abc");
  window.history.replaceState({}, "", "/sign-in");
  visits.markEarnAuthentication(false);
  window.history.replaceState({}, "", "/earn");
  expect(visits.currentEarnVisit("user-a")).toMatchObject({
    id: first.id,
    source: "feedback_email",
    userId: "user-a",
  });
  vi.resetModules();
  const reloaded = await import("../../src/lib/earnExperimentVisits");
  expect(reloaded.currentEarnVisit("user-a").id).toBe(first.id);
});

it("distinguishes normal sign-in and signup from already-authenticated direct visits", () => {
  expect(visits.currentEarnVisit("user-a").source).toBe("direct_or_unknown");
  visits.markEarnAuthentication(false);
  expect(visits.currentEarnVisit("user-a").source).toBe("normal_sign_in");
  visits.markEarnAuthentication(true);
  expect(visits.currentEarnVisit("user-a").source).toBe("signup_onboarding");
});

it("renews after inactivity and a new tagged entry while routine navigation keeps the visit", () => {
  vi.useFakeTimers();
  const first = visits.currentEarnVisit("user-a");
  vi.advanceTimersByTime(visits.EARN_VISIT_IDLE_MS - 1);
  window.history.replaceState({}, "", "/analytics");
  expect(visits.currentEarnVisit("user-a").id).toBe(first.id);
  vi.advanceTimersByTime(visits.EARN_VISIT_IDLE_MS);
  const returning = visits.currentEarnVisit("user-a");
  expect(returning.id).not.toBe(first.id);
  window.history.replaceState({}, "", "/test/app?earn_entry=test_back_email");
  const email = visits.currentEarnVisit("user-a");
  expect(email.id).not.toBe(returning.id);
  expect(email.source).toBe("test_back_email");
});

it("does not reuse one user's visit for another account", () => {
  const first = visits.currentEarnVisit("user-a");
  expect(visits.currentEarnVisit("user-b").id).not.toBe(first.id);
  visits.markEarnAuthentication(false);
  expect(visits.currentEarnVisit("user-c").source).toBe("normal_sign_in");
});

it("classifies shared links and external referrals without storing URLs or query values", () => {
  window.history.replaceState({}, "", "/test/palette-pilot?message=private&token=secret");
  const visit = visits.currentEarnVisit();
  expect(visit).toMatchObject({ source: "shared_link", entryRoute: "shared_link" });
  expect(JSON.stringify(visit)).not.toMatch(/private|secret|palette-pilot/);
  expect(visits.earnEntryRoute("/recordings/shared")).toBe("shared_link");
  expect(visits.earnEntryRoute("/test/96000000-0000-0000-0000-000000000001")).toBe("test");
});

it("preserves referrals through sign-in and treats untagged email links as unknown", () => {
  Object.defineProperty(document, "referrer", {
    configurable: true,
    value: "https://example.org/private?token=secret",
  });
  expect(visits.currentEarnVisit().source).toBe("external_referral");
  visits.markEarnAuthentication(false);
  expect(visits.currentEarnVisit().source).toBe("external_referral");
  expect(sessionStorage.getItem("test4test:earn-experiment:visit")).not.toMatch(
    /example.org|secret/,
  );
});

it("continues in memory when browser storage is unavailable", () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const first = visits.currentEarnVisit("user-a");
  expect(visits.currentEarnVisit("user-a").id).toBe(first.id);
  read.mockRestore();
  write.mockRestore();
});
