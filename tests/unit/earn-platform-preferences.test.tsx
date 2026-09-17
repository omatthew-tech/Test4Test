import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { EarnPage } from "../../src/pages/EarnPage";
import type {
  AccountType,
  ProductType,
  Submission,
  TesterProfile,
  TesterProfileDraft,
} from "../../src/types";
import {
  loadEarnPlatformPreferences,
  saveEarnPlatformPreferences,
} from "../../src/lib/earnPlatformPreferences";

const backend = vi.hoisted(() => ({
  userId: "user-avery",
  accountType: "founder" as AccountType,
  testerProfile: null as TesterProfile | null,
  submissions: [] as Submission[],
  metadata: {} as Record<string, unknown>,
  getUser: vi.fn(),
  updateUser: vi.fn(),
  listEarnSubmissions: vi.fn<(productTypes: ProductType[]) => Promise<Submission[]>>(),
  updateTesterProfile: vi.fn<(profile: TesterProfileDraft) => Promise<{ ok: boolean }>>(),
  getTesterEarnAccessSummary: vi.fn(async () => ({
    completedCreditTests: 0,
    fiveStarRatings: 0,
    paidAccessUnlocked: false,
  })),
}));

vi.mock("../../src/lib/supabase", () => ({
  requireSupabase: () => ({
    auth: {
      getUser: backend.getUser,
      getSession: async () => ({
        data: { session: { user: { id: backend.userId } } },
        error: null,
      }),
      updateUser: backend.updateUser,
    },
  }),
}));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({
    state: { ...seededState, currentUserId: backend.userId, submissions: backend.submissions },
    currentUser: {
      ...seededState.users[0],
      id: backend.userId,
      accountType: backend.accountType,
      testerProfile: backend.testerProfile,
    },
    isConfigured: true,
    listEarnSubmissions: backend.listEarnSubmissions,
    updateTesterProfile: backend.updateTesterProfile,
    getTesterEarnAccessSummary: backend.getTesterEarnAccessSummary,
  }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../src/lib/earnVisibility", () => ({
  loadEarnVisibilitySummary: async () => null,
}));
vi.mock("../../src/lib/testReports", () => ({
  loadMySubmissionReportStatuses: async () => [],
}));

const confirmationKey = "test4test:earn-platform-filter-confirmed:user-avery";
const platformsKey = "test4test:earn-platform-filter:user-avery";
const modalName = "What platforms can you reliably access?";

function earnRoute() {
  return (
    <MemoryRouter initialEntries={["/earn"]}>
      <EarnPage />
      <Link to="/earn?view=updated">Change query</Link>
    </MemoryRouter>
  );
}

async function mount() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(earnRoute());
  });
  return view;
}

function useDesktopDevice() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
}

function expectPlatforms(productTypes: ProductType[], websiteLabel = "Web") {
  for (const [type, label] of [
    ["website", websiteLabel],
    ["ios", "iOS"],
    ["android", "Android"],
  ] as const) {
    expect((screen.getByRole("checkbox", { name: label }) as HTMLInputElement).checked).toBe(
      productTypes.includes(type),
    );
  }
}

function useTesterProfile() {
  backend.accountType = "tester";
  backend.testerProfile = {
    userId: backend.userId,
    firstName: "Avery",
    countryCode: "US",
    region: "NY",
    technologyProficiency: "very",
    devices: ["ios", "android"],
    employmentStatus: "full_time",
    workArea: "software_development",
    paidTestEmailEnabled: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

beforeEach(() => {
  localStorage.clear();
  backend.userId = "user-avery";
  backend.accountType = "founder";
  backend.testerProfile = null;
  backend.submissions = [];
  backend.listEarnSubmissions.mockReset().mockResolvedValue([]);
  backend.updateTesterProfile.mockReset().mockImplementation(async (profile) => {
    backend.testerProfile = { ...backend.testerProfile!, ...profile } as TesterProfile;
    return { ok: true };
  });
  // Existing persistence cases also cover the unchanged unknown-device behavior.
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Unknown");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("");
  backend.metadata = { display_name: "Avery" };
  backend.getUser.mockReset().mockImplementation(async () => ({
    data: { user: { id: backend.userId, user_metadata: { ...backend.metadata } } },
    error: null,
  }));
  backend.updateUser.mockReset().mockImplementation(async ({ data }) => {
    Object.assign(backend.metadata, data);
    return { error: null };
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("saves to the account and stays closed on a new visit with empty browser storage", async () => {
  const user = userEvent.setup();
  await mount();
  const dialog = screen.getByRole("dialog", { name: modalName });
  await user.click(within(dialog).getByRole("checkbox", { name: "Websites" }));
  await user.click(within(dialog).getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(backend.metadata).toEqual({
    display_name: "Avery",
    earn_platform_preferences: ["ios", "android"],
    earn_platform_preferences_confirmed: true,
  });

  cleanup();
  localStorage.clear();
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expect((screen.getByRole("checkbox", { name: "Web" }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("checkbox", { name: "iOS" }) as HTMLInputElement).checked).toBe(true);

  cleanup();
  backend.userId = "user-nina";
  backend.metadata = {};
  await mount();
  expect(screen.getByRole("dialog", { name: modalName })).toBeTruthy();
});

it("waits for account confirmation without flashing the modal", async () => {
  let resolveRead!: (value: unknown) => void;
  backend.getUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () =>
    resolveRead({
      data: {
        user: { id: backend.userId, user_metadata: { earn_platform_preferences_confirmed: true } },
      },
      error: null,
    }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("preserves choices and allows retry when account saving fails", async () => {
  const user = userEvent.setup();
  backend.updateUser.mockResolvedValueOnce({ error: new Error("Offline") });
  await mount();
  await user.click(screen.getByRole("checkbox", { name: "Android" }));
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Please try again");
  expect((screen.getByRole("checkbox", { name: "Android" }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect(localStorage.getItem(confirmationKey)).toBeNull();
  expect(backend.metadata.earn_platform_preferences_confirmed).toBeUndefined();

  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(backend.updateUser).toHaveBeenCalledTimes(2);
});

it("a delayed account read cannot reopen the modal after preferences are saved from Filters", async () => {
  const user = userEvent.setup();
  let resolveRead!: (value: unknown) => void;
  backend.getUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.click(screen.getByRole("checkbox", { name: "Web" }));
  await waitFor(() => expect(backend.metadata.earn_platform_preferences_confirmed).toBe(true));
  await act(async () =>
    resolveRead({
      data: { user: { id: backend.userId, user_metadata: {} } },
      error: null,
    }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect((screen.getByRole("checkbox", { name: "Web" }) as HTMLInputElement).checked).toBe(false);
});

it("disables duplicate saves until account persistence finishes", async () => {
  const user = userEvent.setup();
  let finishSave!: (value: unknown) => void;
  backend.updateUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  await mount();
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  const saving = screen.getByRole("button", { name: "Saving preferences" }) as HTMLButtonElement;
  expect(saving.disabled).toBe(true);
  await user.click(saving);
  expect(backend.updateUser).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => finishSave({ error: null }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("carries forward existing local confirmations without showing the modal", async () => {
  localStorage.setItem(confirmationKey, "true");
  localStorage.setItem(platformsKey, JSON.stringify(["website"]));
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(backend.metadata.earn_platform_preferences_confirmed).toBe(true);
  expect(backend.metadata.earn_platform_preferences).toEqual(["website"]);
});

it("closing without saving does not confirm the preferences", async () => {
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(backend.updateUser).not.toHaveBeenCalled();
  cleanup();
  await mount();
  expect(screen.getByRole("dialog", { name: modalName })).toBeTruthy();
});

it("honors account confirmation even when local storage cannot be written", async () => {
  const user = userEvent.setup();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  await mount();
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  cleanup();
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("does not re-prompt when account confirmation cannot be checked", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Offline") });
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("preserves an explicitly saved empty selection and ignores malformed platform data", async () => {
  await saveEarnPlatformPreferences(backend.userId, []);
  expect(await loadEarnPlatformPreferences(backend.userId)).toEqual({
    confirmed: true,
    productTypes: [],
  });
  backend.metadata.earn_platform_preferences = ["unknown"];
  expect(await loadEarnPlatformPreferences(backend.userId)).toEqual({
    confirmed: true,
    productTypes: null,
  });
});

it("rejects account changes before saving or applying another user's confirmation", async () => {
  await expect(saveEarnPlatformPreferences("another-user", ["website"])).rejects.toThrow(
    "sign-in changed",
  );
  await expect(loadEarnPlatformPreferences("another-user")).rejects.toThrow("sign-in changed");
  expect(backend.updateUser).not.toHaveBeenCalled();
});

it("starts a desktop visit with websites before the first request and does not save the default", async () => {
  useDesktopDevice();
  await mount();
  expectPlatforms(["website"], "Websites");
  expect(backend.listEarnSubmissions).toHaveBeenCalledWith(["website"]);
  expect(
    backend.listEarnSubmissions.mock.calls.every(([types]) => types.join() === "website"),
  ).toBe(true);
  expect(backend.updateUser).not.toHaveBeenCalled();
  expect(backend.updateTesterProfile).not.toHaveBeenCalled();
  expect(localStorage.getItem(platformsKey)).toBeNull();
  expect(localStorage.getItem(confirmationKey)).toBeNull();
});

it("keeps desktop websites active while caching original saved account preferences", async () => {
  useDesktopDevice();
  backend.metadata = {
    earn_platform_preferences: ["ios", "android"],
    earn_platform_preferences_confirmed: true,
  };
  localStorage.setItem(platformsKey, JSON.stringify(["android"]));
  await mount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["website"]);
  expect(backend.updateUser).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(platformsKey)!)).toEqual(["ios", "android"]);
  expect(
    backend.listEarnSubmissions.mock.calls.every(([types]) => types.join() === "website"),
  ).toBe(true);
});

it("migrates original local preferences rather than the desktop default", async () => {
  useDesktopDevice();
  localStorage.setItem(confirmationKey, "true");
  localStorage.setItem(platformsKey, JSON.stringify(["android"]));
  await mount();
  expect(backend.metadata.earn_platform_preferences).toEqual(["android"]);
  expect(JSON.parse(localStorage.getItem(platformsKey)!)).toEqual(["android"]);
  await userEvent.setup().click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["website"]);
});

it("preserves manual desktop choices through rerenders, query changes and resizing, but resets on a new visit", async () => {
  useDesktopDevice();
  backend.metadata = { earn_platform_preferences_confirmed: true };
  const user = userEvent.setup();
  const view = await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.click(screen.getByRole("checkbox", { name: "iOS" }));
  expectPlatforms(["website", "ios"]);
  expect(backend.metadata.earn_platform_preferences).toEqual(["website", "ios"]);

  // A submission refresh changes the original defaults and reruns preference hydration.
  backend.submissions = [
    { ...seededState.submissions[0], userId: backend.userId, productTypes: ["android"] },
  ];
  await act(async () => {
    view.rerender(earnRoute());
  });
  await user.click(screen.getByRole("link", { name: "Change query" }));
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
  expectPlatforms(["website", "ios"]);

  cleanup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["website"]);
  expect(backend.metadata.earn_platform_preferences).toEqual(["website", "ios"]);
});

it("resets desktop filters before requesting results for a different account", async () => {
  useDesktopDevice();
  backend.metadata = { earn_platform_preferences_confirmed: true };
  const user = userEvent.setup();
  const view = await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.click(screen.getByRole("checkbox", { name: "Android" }));
  expectPlatforms(["website", "android"]);
  backend.listEarnSubmissions.mockClear();
  backend.userId = "user-nina";
  backend.metadata = {
    earn_platform_preferences: ["ios"],
    earn_platform_preferences_confirmed: true,
  };
  await act(async () => {
    view.rerender(earnRoute());
  });
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["website"]);
  expect(
    backend.listEarnSubmissions.mock.calls.every(([types]) => types.join() === "website"),
  ).toBe(true);
  expect(backend.listEarnSubmissions).toHaveBeenCalled();
});

it("ignores a delayed account response after explicit desktop filter changes", async () => {
  useDesktopDevice();
  let resolveRead!: (value: unknown) => void;
  backend.getUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.click(screen.getByRole("checkbox", { name: "Android" }));
  await act(async () => {
    resolveRead({
      data: { user: { id: backend.userId, user_metadata: { earn_platform_preferences: ["ios"] } } },
      error: null,
    });
  });
  expectPlatforms(["website", "android"]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("allows an empty desktop selection without restoring websites until the next visit", async () => {
  useDesktopDevice();
  backend.metadata = { earn_platform_preferences_confirmed: true };
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.click(screen.getByRole("checkbox", { name: "Web" }));
  expectPlatforms([]);
  expect(screen.getByRole("heading", { name: "No platforms selected" })).toBeTruthy();
  cleanup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["website"]);
  expect(backend.metadata.earn_platform_preferences).toEqual([]);
});

it("keeps desktop tester defaults separate from profile devices and saves explicit edits", async () => {
  useDesktopDevice();
  useTesterProfile();
  const user = userEvent.setup();
  const view = await mount();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["website"]);
  expect(backend.testerProfile?.devices).toEqual(["ios", "android"]);
  expect(backend.updateTesterProfile).not.toHaveBeenCalled();
  expect(
    backend.listEarnSubmissions.mock.calls.every(([types]) => types.join() === "website"),
  ).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: "Android" }));
  expect(backend.updateTesterProfile).toHaveBeenCalledWith(
    expect.objectContaining({ devices: ["computer", "android"] }),
  );
  await act(async () => {
    view.rerender(earnRoute());
  });
  expectPlatforms(["website", "android"]);
});

it.each(["founder", "tester"] as const)("preserves mobile %s preferences", async (accountType) => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  );
  backend.metadata = {
    earn_platform_preferences: ["ios", "android"],
    earn_platform_preferences_confirmed: true,
  };
  if (accountType === "tester") useTesterProfile();
  await mount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Filters" }));
  expectPlatforms(["ios", "android"]);
  expect(backend.listEarnSubmissions).toHaveBeenLastCalledWith(["ios", "android"]);
});
