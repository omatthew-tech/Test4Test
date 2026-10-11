import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TesterSignupPage } from "../../src/pages/TesterSignupPage";
import {
  clearTesterSignupDraft,
  EMPTY_TESTER_PROFILE_DRAFT,
  loadTesterSignupDraft,
  saveTesterSignupDraft,
} from "../../src/lib/testerSignup";

vi.mock("../../src/context/AppStateContext", () => ({ useAppState: () => ({}) }));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const draft = { ...EMPTY_TESTER_PROFILE_DRAFT, firstName: "Alex", countryCode: "US" };
const mount = () =>
  render(
    <MemoryRouter>
      <TesterSignupPage />
    </MemoryRouter>,
  );
const checked = (name: string) =>
  (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked;

beforeEach(() => {
  clearTesterSignupDraft();
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0)",
    platform: "Win32",
    maxTouchPoints: 0,
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  clearTesterSignupDraft();
  vi.unstubAllGlobals();
});

it("preselects the detected device for a new signup", () => {
  mount();
  expect(loadTesterSignupDraft()?.draft.devices).toEqual(["computer"]);
  expect(loadTesterSignupDraft()?.deviceSelectionInitialized).toBe(true);
  expect(EMPTY_TESTER_PROFILE_DRAFT.devices).toEqual([]);
});

it("adds a default to a saved unanswered draft while preserving additional manual choices", () => {
  saveTesterSignupDraft(draft, 3, "");
  mount();
  expect(checked("Computer")).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "iOS" }));
  expect(loadTesterSignupDraft()?.draft.devices).toEqual(["computer", "ios"]);
});

it("respects unchecking the default through step navigation and remounting", () => {
  saveTesterSignupDraft(draft, 3, "");
  const view = mount();
  fireEvent.click(screen.getByRole("checkbox", { name: "Computer" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(checked("Computer")).toBe(false);
  view.unmount();
  mount();
  expect(checked("Computer")).toBe(false);
  expect(loadTesterSignupDraft()?.draft.devices).toEqual([]);
});

it("preserves existing answers instead of adding the detected device", () => {
  saveTesterSignupDraft({ ...draft, devices: ["ios", "android"] }, 3, "");
  mount();
  expect(checked("Computer")).toBe(false);
  expect(checked("iOS")).toBe(true);
  expect(checked("Android")).toBe(true);
});

it("leaves uncertain devices unselected", () => {
  vi.stubGlobal("navigator", { userAgent: "Unknown", platform: "", maxTouchPoints: 0 });
  saveTesterSignupDraft(draft, 3, "");
  mount();
  expect(checked("Computer")).toBe(false);
  expect(checked("iOS")).toBe(false);
  expect(checked("Android")).toBe(false);
});
