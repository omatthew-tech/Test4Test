import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { AppStateProvider, useAppActions, useAppState } from "../../src/context/AppStateContext";
import App from "../../src/App";

const backend = vi.hoisted(() => ({
  reads: [] as Array<{ table: string; signal?: AbortSignal; filters: Record<string, unknown> }>,
  upserts: 0,
  subscriptions: 0,
  userReads: 0,
  profileName: "Owner",
  user: { id: "owner", email: "owner@example.test", user_metadata: {} },
  authChange: null as null | ((event: string, session: unknown) => void),
  creditWait: null as null | Promise<void>,
  failedTable: null as string | null,
  signedOut: false,
  authError: null as { name: string; message: string; status: number } | null,
  ratings: [] as Record<string, unknown>[],
}));
vi.mock("../../src/lib/analytics", () => ({
  trackAuthenticatedVisit: vi.fn(),
  trackEventOncePerSession: vi.fn(),
}));
vi.mock("../../src/lib/supabase", () => ({
  hasSupabaseConfig: true,
  isTestAccountEmail: () => false,
  supabaseUrl: "https://example.test",
  supabasePublishableKey: "public-test",
  requireSupabase: () => ({
    auth: {
      getUser: async () => {
        backend.userReads++;
        return {
          data: { user: backend.signedOut ? null : backend.user },
          error: backend.authError,
        };
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
            if (table === backend.failedTable) {
              return { data: null, error: { message: "Data service unavailable" } };
            }
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
                  : table === "feedback_ratings"
                    ? backend.ratings
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
  return (
    <>
      <output>{value.isLoading ? "loading" : (value.currentUser?.id ?? "anonymous")}</output>
      {value.loadError && <span role="alert">{value.loadError}</span>}
      <output data-testid="ratings">{JSON.stringify(value.state.feedbackRatings)}</output>
    </>
  );
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
  backend.failedTable = null;
  backend.signedOut = false;
  backend.authError = null;
  backend.ratings = [];
  actions.length = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["/profile", ["profiles"]],
  ["/credits", ["profiles", "credit_transactions"]],
  ["/recordings", ["profiles", "submissions"]],
  ["/share", ["profiles", "submissions"]],
])("loads only the data required by %s and handles INITIAL_SESSION once", async (route, tables) => {
  await mount(route as string);
  expect(backend.reads.map((read) => read.table)).toEqual(tables);
  expect(backend.userReads).toBe(1);
  expect(backend.upserts).toBe(0);
});

it("Share reads only the owner's submissions, even when ratings are unavailable", async () => {
  backend.failedTable = "feedback_ratings";
  await mount("/share");
  expect(backend.reads.map((read) => read.table)).toEqual(["profiles", "submissions"]);
  expect(backend.reads[1].filters).toEqual({ user_id: "owner" });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("loads pre-migration ratings without discarding the signed-in user", async () => {
  backend.ratings = [{ id: "rating", star_rating: null, rating_value: "smiley" }];
  await mount("/submissions");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByTestId("ratings").textContent).toContain('"starRating":5');
});

it("keeps a confirmed identity when route data fails, then recovers on retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.failedTable = "credit_transactions";
  await mount("/credits");
  expect(screen.getByRole("alert")).toBeTruthy();
  backend.failedTable = null;
  await act(async () => actions[actions.length - 1].retryLoad());
  expect(screen.getByText("owner")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not let a stale failure replace a successful route load", async () => {
  let finish!: () => void;
  backend.creditWait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  backend.failedTable = "credit_transactions";
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
  await act(async () => navigate("/profile"));
  await screen.findByText("owner");
  await act(async () => finish());
  expect(screen.queryByRole("alert")).toBeNull();
});

it("clears the retained profile on a real sign-out after a data failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.failedTable = "credit_transactions";
  await mount("/credits");
  backend.signedOut = true;
  await act(async () => backend.authChange!("SIGNED_OUT", null));
  await screen.findByText("anonymous");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps independent public pages accessible during an auth outage", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.authError = { name: "AuthRetryableFetchError", message: "Unavailable", status: 503 };
  const Blog = () => <h1>Public blog</h1>;
  render(<App prerenderPath="/blog" blogPages={{ index: Blog, post: Blog }} />);
  await waitFor(() => expect(console.error).toHaveBeenCalled());
  expect(screen.getByRole("heading", { name: "Public blog" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

it.each(["/share", "/credits", "/recordings", "/submissions"])(
  "keeps %s stable on load failure instead of bouncing through sign-in",
  async (path) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.failedTable = path === "/credits" ? "credit_transactions" : "submissions";
    window.history.replaceState({}, "", `${path}?source=test`);
    const redirects = vi.spyOn(window.history, "replaceState");
    render(<App />);
    await screen.findByRole("heading", { name: "Unable to load this page" });
    expect(window.location.pathname).toBe(path);
    expect(window.location.search).toBe("?source=test");
    expect(redirects.mock.calls.filter((call) => call[2] !== undefined)).toEqual([]);
    expect(backend.userReads).toBe(1);
    expect(screen.queryByRole("textbox", { name: "Email address" })).toBeNull();
    // A repeated failed retry remains on the same route and never starts a loop.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(backend.userReads).toBe(2));
    await screen.findByRole("button", { name: "Try again" });
    expect(redirects.mock.calls.filter((call) => call[2] !== undefined)).toEqual([]);
  },
);

it("retries a failed Share load without losing the URL or presenting a false empty account", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.failedTable = "submissions";
  window.history.replaceState({}, "", "/share?source=test");
  render(<App />);
  await screen.findByRole("button", { name: "Try again" });
  expect(screen.queryByText("No live test to share")).toBeNull();
  backend.failedTable = null;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No live test to share");
  expect(window.location.pathname + window.location.search).toBe("/share?source=test");
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["profiles", "auth"])(
  "shows a retry for a failed %s check without redirecting",
  async (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "auth")
      backend.authError = {
        name: "AuthRetryableFetchError",
        message: "Failed to fetch",
        status: 503,
      };
    else backend.failedTable = "profiles";
    window.history.replaceState({}, "", "/share");
    const redirects = vi.spyOn(window.history, "replaceState");
    render(<App />);
    await screen.findByRole("heading", { name: "Unable to load this page" });
    expect(redirects.mock.calls.filter((call) => call[2] !== undefined)).toEqual([]);
  },
);

it.each([
  null,
  { name: "AuthSessionMissingError", message: "No session", status: 400 },
  { name: "AuthApiError", message: "Invalid JWT", status: 401 },
])(
  "redirects genuinely signed-out visitors once, preserving their destination (%j)",
  async (error) => {
    backend.signedOut = true;
    backend.authError = error;
    window.history.replaceState({}, "", "/share?source=test");
    render(<App />);
    await screen.findByRole("textbox", { name: "Email address" });
    expect(window.location.pathname).toBe("/sign-in");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/share?source=test");
    await waitFor(() => expect(backend.userReads).toBe(2));
  },
);
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
