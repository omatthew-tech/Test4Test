import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { saveFounderWelcome } from "../../src/lib/founderWelcome";

const backend = vi.hoisted(() => ({
  userId: "user-avery",
  email: "avery@example.com",
  signedInAt: "2026-09-21T12:00:00Z",
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
const welcomeTitles = [
  "Welcome to Test4Test!",
  "How to earn credits",
  "Share your test",
  "Review your feedback",
];

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
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  localStorage.clear();
  sessionStorage.clear();
  backend.userId = "user-avery";
  backend.email = "avery@example.com";
  backend.signedInAt = "2026-09-21T12:00:00Z";
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
    data: {
      user: {
        id: backend.userId,
        email: backend.email,
        last_sign_in_at: backend.signedInAt,
        user_metadata: { ...backend.metadata },
      },
    },
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
  vi.unstubAllGlobals();
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
    welcomeStatus: null,
    confirmed: true,
    productTypes: [],
  });
  backend.metadata.earn_platform_preferences = ["unknown"];
  expect(await loadEarnPlatformPreferences(backend.userId)).toEqual({
    welcomeStatus: null,
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

it("walks new founders through the copy and dots before saving completion and handing off", async () => {
  backend.metadata.founder_welcome_v1 = "pending";
  const user = userEvent.setup();
  await mount();
  expect(screen.queryByRole("dialog", { name: modalName })).toBeNull();
  expect(screen.queryByRole("list", { name: "Progress" })).toBeNull();
  expect(
    screen.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent ===
          'Did you know? According to JMIR Human Factors, "recorded think-aloud testing identifies 77% of usability problems."',
    ),
  ).toBeTruthy();
  for (let step = 1; step <= 3; step++) {
    await user.click(screen.getByRole("button", { name: "Next" }));
    const dialog = screen.getByRole("dialog", { name: welcomeTitles[step] });
    const progress = within(dialog).getByRole("list", { name: "Progress" });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(3);
    expect(progress.querySelector('[aria-current="step"]')?.textContent).toBe(welcomeTitles[step]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    const previous = screen.getByRole("dialog", { name: welcomeTitles[step - 1] });
    await user.click(within(previous).getByRole("button", { name: "Next" }));
    expect(backend.updateUser).not.toHaveBeenCalled();
  }
  await user.click(screen.getByRole("button", { name: "Get started" }));
  expect(backend.metadata.founder_welcome_v1).toBe("completed");
  expect(backend.metadata.display_name).toBe("Avery");
  expect(backend.metadata.earn_platform_preferences_confirmed).toBeUndefined();
  expect(screen.getByRole("dialog", { name: modalName })).toBeTruthy();
  cleanup();
  localStorage.clear();
  await mount();
  expect(screen.queryByRole("dialog", { name: welcomeTitles[0] })).toBeNull();
  expect(screen.getByRole("dialog", { name: modalName })).toBeTruthy();
});

it.each(welcomeTitles.map((title, step) => ({ title, step })))(
  "permanently dismisses $title using Escape",
  async ({ title, step }) => {
    backend.metadata.founder_welcome_v1 = "pending";
    const user = userEvent.setup();
    await mount();
    for (let index = 0; index < step; index++)
      await user.click(screen.getByRole("button", { name: "Next" }));
    const dialog = screen.getByRole("dialog", { name: title });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await screen.findByRole("dialog", { name: modalName });
    expect(backend.metadata.founder_welcome_v1).toBe("dismissed");
    expect(backend.updateUser).toHaveBeenCalledTimes(1);
    cleanup();
    localStorage.clear();
    await mount();
    expect(screen.queryByRole("dialog", { name: welcomeTitles[0] })).toBeNull();
  },
);

it("restarts an unfinished tour on the next visit without writing progress", async () => {
  backend.metadata.founder_welcome_v1 = "pending";
  await mount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
  cleanup();
  await mount();
  expect(screen.getByRole("dialog", { name: welcomeTitles[0] })).toBeTruthy();
  expect(backend.updateUser).not.toHaveBeenCalled();
});

it.each(["dismissed", "completed"] as const)(
  "retains the tour when saving %s fails and retries the same choice",
  async (outcome) => {
    backend.metadata.founder_welcome_v1 = "pending";
    backend.updateUser.mockResolvedValueOnce({ error: new Error("Offline") });
    const user = userEvent.setup();
    await mount();
    if (outcome === "completed") {
      for (let index = 0; index < 3; index++)
        await user.click(screen.getByRole("button", { name: "Next" }));
    }
    if (outcome === "completed")
      await user.click(screen.getByRole("button", { name: "Get started" }));
    else fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("could not save your choice");
    expect(backend.metadata.founder_welcome_v1).toBe("pending");
    expect(screen.queryByRole("dialog", { name: modalName })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(backend.metadata.founder_welcome_v1).toBe(outcome);
    expect(screen.getByRole("dialog", { name: modalName })).toBeTruthy();
  },
);

it("guards X, Escape, Back and Next while dismissal is saving", async () => {
  backend.metadata.founder_welcome_v1 = "pending";
  let finishSave!: (value: unknown) => void;
  backend.updateUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Next" }));
  const dialog = screen.getByRole("dialog", { name: welcomeTitles[1] });
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  const back = screen.getByRole("button", { name: "Back" });
  expect((back as HTMLButtonElement).disabled).toBe(true);
  await user.click(back);
  expect(screen.getByRole("dialog", { name: welcomeTitles[1] })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Saving" }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(backend.updateUser).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog", { name: modalName })).toBeNull();
  await act(async () => finishSave({ error: null }));
  expect(screen.getByRole("dialog", { name: modalName })).toBeTruthy();
});

it("retries an unavailable account read before choosing a popup", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.metadata.founder_welcome_v1 = "pending";
  backend.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Offline") });
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("dialog", { name: welcomeTitles[0] })).toBeTruthy();
});

it("does not show either popup before a pending signup becomes a founder", async () => {
  backend.accountType = "pending";
  backend.metadata.founder_welcome_v1 = "pending";
  const view = await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  backend.accountType = "founder";
  await act(async () => view.rerender(earnRoute()));
  expect(screen.getByRole("dialog", { name: welcomeTitles[0] })).toBeTruthy();
});

it("does not show the founder tour to paid testers", async () => {
  useTesterProfile();
  backend.metadata.founder_welcome_v1 = "pending";
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("ignores a delayed dismissal after switching accounts", async () => {
  backend.metadata.founder_welcome_v1 = "pending";
  let finishSave!: (value: unknown) => void;
  backend.updateUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  const view = await mount();
  fireEvent.keyDown(screen.getByRole("dialog", { name: welcomeTitles[0] }), { key: "Escape" });
  await waitFor(() => expect(backend.updateUser).toHaveBeenCalled());
  backend.userId = "user-nina";
  await act(async () => view.rerender(earnRoute()));
  await act(async () => finishSave({ error: null }));
  expect(screen.getByRole("dialog", { name: welcomeTitles[0] })).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: modalName })).toBeNull();
});

it("rejects saving welcome preferences for a different account", async () => {
  await expect(saveFounderWelcome("another-user", "dismissed")).rejects.toThrow("sign-in changed");
  expect(backend.updateUser).not.toHaveBeenCalled();
});

it.each([
  { action: "complete", previous: "completed", email: "test@test4test.io" },
  { action: "Escape", previous: "dismissed", email: "test@test4test.io" },
  { action: "Escape", previous: undefined, email: "TEST@TEST4TEST.IO" },
])(
  "replays both popups on each test-account sign-in after $action",
  async ({ action, previous, email }) => {
    backend.email = email;
    backend.metadata = {
      founder_welcome_v1: previous,
      earn_platform_preferences_confirmed: true,
      earn_platform_preferences: ["ios"],
    };
    localStorage.setItem(confirmationKey, "true");
    const user = userEvent.setup();
    await mount();
    const welcome = screen.getByRole("dialog", { name: welcomeTitles[0] });
    expect(screen.queryByRole("dialog", { name: modalName })).toBeNull();
    if (action === "complete") {
      for (let step = 0; step < 3; step++)
        await user.click(screen.getByRole("button", { name: "Next" }));
      await user.click(screen.getByRole("button", { name: "Get started" }));
    } else {
      fireEvent.keyDown(welcome, { key: "Escape" });
    }
    await screen.findByRole("dialog", { name: modalName });

    // A reload keeps the platform handoff, without repeating the finished tour.
    cleanup();
    await mount();
    expect(screen.queryByRole("dialog", { name: welcomeTitles[0] })).toBeNull();
    const platforms = screen.getByRole("dialog", { name: modalName });
    expectPlatforms(["ios"], "Websites");
    await user.click(
      within(platforms).getByRole("button", {
        name: action === "complete" ? "Save preferences" : "Close",
      }),
    );
    cleanup();
    await mount();
    expect(screen.queryByRole("dialog")).toBeNull();

    // Auth's next successful sign-in resets only the test account's replay.
    cleanup();
    backend.signedInAt = "2026-09-21T13:00:00Z";
    await mount();
    expect(screen.getByRole("dialog", { name: welcomeTitles[0] })).toBeTruthy();
  },
);

it.each([
  "another@test4test.io",
  "test+demo@test4test.io",
  "test@test4test.io.example.com",
  "test@example.com",
])("preserves permanent dismissal for %s", async (email) => {
  backend.email = email;
  backend.metadata = {
    email: "test@test4test.io",
    founder_welcome_v1: "dismissed",
    earn_platform_preferences_confirmed: true,
  };
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  cleanup();
  localStorage.clear();
  backend.signedInAt = "2026-09-21T13:00:00Z";
  await mount();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(backend.updateUser).not.toHaveBeenCalled();
});

it("does not consume the test-account replay when dismissal fails", async () => {
  backend.email = "test@test4test.io";
  backend.metadata = {
    founder_welcome_v1: "completed",
    earn_platform_preferences_confirmed: true,
  };
  backend.updateUser.mockResolvedValueOnce({ error: new Error("Offline") });
  await mount();
  fireEvent.keyDown(screen.getByRole("dialog", { name: welcomeTitles[0] }), { key: "Escape" });
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("could not save your choice");
  cleanup();
  await mount();
  expect(screen.getByRole("dialog", { name: welcomeTitles[0] })).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: modalName })).toBeNull();
});
