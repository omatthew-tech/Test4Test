import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { AppStateProvider, useAppActions, useAppState } from "../../src/context/AppStateContext";

const backend = vi.hoisted(() => ({
  reads: [] as Array<{ table: string; signal?: AbortSignal; filters: Record<string, unknown> }>,
  upserts: 0,
  subscriptions: 0,
  userReads: 0,
  profileName: "Owner",
  user: { id: "owner", email: "owner@example.test", user_metadata: {} },
  authChange: null as null | ((event: string, session: unknown) => void),
  creditWait: null as null | Promise<void>,
}));
vi.mock("../../src/lib/analytics", () => ({
  trackAuthenticatedVisit: vi.fn(),
  trackEventOncePerSession: vi.fn(),
}));
vi.mock("../../src/lib/supabase", () => ({
  hasSupabaseConfig: true,
  supabaseUrl: "https://example.test",
  supabasePublishableKey: "public-test",
  requireSupabase: () => ({
    auth: {
      getUser: async () => {
        backend.userReads++;
        return { data: { user: backend.user } };
      },
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        backend.subscriptions++;
        backend.authChange = callback;
        queueMicrotask(() => callback("INITIAL_SESSION", { user: backend.user }));
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: (table: string) => {
      const read = {
        table,
        filters: {} as Record<string, unknown>,
        signal: undefined as AbortSignal | undefined,
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          read.filters[key] = value;
          return query;
        },
        in: (key: string, value: unknown) => {
          read.filters[key] = value;
          return query;
        },
        or: () => query,
        order: () => query,
        abortSignal: (signal: AbortSignal) => {
          read.signal = signal;
          return query;
        },
        upsert: () => {
          backend.upserts++;
          return query;
        },
        maybeSingle: () => query,
        single: () => query,
        then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => {
          backend.reads.push(read);
          return (async () => {
            if (table === "credit_transactions") await backend.creditWait;
            return {
              data:
                table === "profiles"
                  ? {
                      id: backend.user.id,
                      email: backend.user.email,
                      display_name: backend.profileName,
                      ban_status: "clear",
                      created_at: "2026-01-01",
                    }
                  : [],
              error: null,
            };
          })().then(resolve, reject);
        },
      };
      return query;
    },
  }),
}));

let navigate: ReturnType<typeof useNavigate>;
const actions: ReturnType<typeof useAppActions>[] = [];
function Probe() {
  const value = useAppState();
  const action = useAppActions();
  const routerNavigate = useNavigate();
  useEffect(() => {
    navigate = routerNavigate;
    actions.push(action);
  }, [routerNavigate, action]);
  return <output>{value.isLoading ? "loading" : (value.currentUser?.id ?? "anonymous")}</output>;
}
function mount(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    </MemoryRouter>,
  );
  return screen.findByText("owner");
}
beforeEach(() => {
  backend.reads = [];
  backend.upserts = 0;
  backend.subscriptions = 0;
  backend.userReads = 0;
  backend.profileName = "Owner";
  backend.creditWait = null;
  actions.length = 0;
});
afterEach(cleanup);

it.each([
  ["/profile", ["profiles"]],
  ["/credits", ["profiles", "credit_transactions"]],
  ["/recordings", ["profiles", "submissions"]],
])("loads only the data required by %s and handles INITIAL_SESSION once", async (route, tables) => {
  await mount(route as string);
  expect(backend.reads.map((read) => read.table)).toEqual(tables);
  expect(backend.userReads).toBe(1);
  expect(backend.upserts).toBe(0);
});
it("keeps query-string navigation local, context actions stable, and one auth subscription", async () => {
  await mount("/recordings?response=one");
  await act(async () => navigate("/recordings?response=two"));
  expect(backend.userReads).toBe(1);
  await act(async () => navigate("/credits"));
  await waitFor(() =>
    expect(backend.reads.some((read) => read.table === "credit_transactions")).toBe(true),
  );
  expect(backend.subscriptions).toBe(1);
  expect(new Set(actions)).toHaveProperty("size", 1);
});
it("still synchronizes a changed authentication display name", async () => {
  backend.profileName = "Old name";
  await mount("/profile");
  expect(backend.upserts).toBe(1);
});
it("aborts stale route reads before they can replace the current route state", async () => {
  let finish!: () => void;
  backend.creditWait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  render(
    <MemoryRouter initialEntries={["/credits"]}>
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(backend.reads.some((read) => read.table === "credit_transactions")).toBe(true),
  );
  const signal = backend.reads.find((read) => read.table === "credit_transactions")!.signal;
  await act(async () => navigate("/profile"));
  await screen.findByText("owner");
  expect(signal?.aborted).toBe(true);
  await act(async () => finish());
  expect(screen.getByText("owner")).toBeTruthy();
});
