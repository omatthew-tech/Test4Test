import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { EarnPage } from "../../src/pages/EarnPage";
import {
  loadEarnPlatformPreferences,
  saveEarnPlatformPreferences,
} from "../../src/lib/earnPlatformPreferences";

const backend = vi.hoisted(() => ({
  userId: "user-avery",
  metadata: {} as Record<string, unknown>,
  getUser: vi.fn(),
  updateUser: vi.fn(),
  listEarnSubmissions: vi.fn(async () => []),
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
    state: { ...seededState, currentUserId: backend.userId, submissions: [] },
    currentUser: { ...seededState.users[0], id: backend.userId, accountType: "founder" },
    isConfigured: true,
    listEarnSubmissions: backend.listEarnSubmissions,
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

async function mount() {
  await act(async () => {
    render(
      <MemoryRouter>
        <EarnPage />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  backend.userId = "user-avery";
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
