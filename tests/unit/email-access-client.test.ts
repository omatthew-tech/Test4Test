import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { captureEmailAccessToken } from "../../src/lib/emailAccessBootstrap";
import { createEmailAccessExchange } from "../../src/lib/emailAccess";
import {
  accountDraftKey,
  prepareEmailAccountDrafts,
  syncAccountDraftOwner,
} from "../../src/lib/accountDrafts";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), setSession: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  requireSupabase: () => ({ auth: mocks }),
  supabaseUrl: "https://auth.example.test",
  supabasePublishableKey: "public",
}));
const token = "cd".repeat(32);
const destination =
  "/recordings?response=41000000-0000-4000-8000-000000000004&earn_entry=feedback_email";
const session = (id: string) => ({ user: { id }, access_token: `${id}-session` });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.unstubAllGlobals());
it("captures and removes the credential and query before normal initialization", () => {
  window.history.replaceState(null, "", `/email-access?ignored=1#token=${token}`);
  expect(captureEmailAccessToken()).toBe(token);
  expect(window.location.pathname).toBe("/email-access");
  expect(window.location.hash + window.location.search).toBe("");
  expect(window.history.state).toBeNull();
});
it("installs a persistent session, coalesces repeated clicks, and keeps tokens out of URL and storage", async () => {
  mocks.getSession
    .mockResolvedValueOnce({ data: { session: null } })
    .mockResolvedValue({ data: { session: session("recipient") } });
  mocks.setSession.mockResolvedValue({ data: { user: { id: "recipient" } } });
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        userId: "recipient",
        reuseSession: false,
        destination,
        session: { access_token: "access", refresh_token: "refresh" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const exchange = createEmailAccessExchange(token);
  expect(await Promise.all([exchange(), exchange()])).toEqual([destination, destination]);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(mocks.setSession).toHaveBeenCalledWith({
    access_token: "access",
    refresh_token: "refresh",
  });
  expect(fetchMock.mock.calls[0][0]).not.toContain(token);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ token }),
  });
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(token);
});
it("reuses a matching session without replacing it", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: session("recipient") } });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ userId: "recipient", reuseSession: true, destination })),
      ),
  );
  expect(await createEmailAccessExchange(token)()).toBe(destination);
  expect(mocks.setSession).not.toHaveBeenCalled();
});
it("isolates old account drafts, preserves them for that account, and restores its namespace", async () => {
  const draft = "test4test:recording-session:submission";
  sessionStorage.setItem(draft, "previous-account-recording");
  localStorage.setItem("test4test-submit-flow-resume:v1", "previous-account-submission");
  prepareEmailAccountDrafts("previous", "recipient");
  expect(sessionStorage.getItem(accountDraftKey(draft))).toBeNull();
  expect(localStorage.getItem(accountDraftKey("test4test-submit-flow-resume:v1"))).toBeNull();
  sessionStorage.setItem(accountDraftKey(draft), "recipient-recording");
  syncAccountDraftOwner("previous");
  expect(sessionStorage.getItem(accountDraftKey(draft))).toBe("previous-account-recording");
  expect(localStorage.getItem(accountDraftKey("test4test-submit-flow-resume:v1"))).toBe(
    "previous-account-submission",
  );
  syncAccountDraftOwner("recipient");
  expect(sessionStorage.getItem(accountDraftKey(draft))).toBe("recipient-recording");
});
it("preserves the credential for temporary retries but forgets invalid/revoked credentials", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: session("recipient") } });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "recipient", reuseSession: true, destination })),
    )
    .mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  const exchange = createEmailAccessExchange(token);
  await expect(exchange()).rejects.toMatchObject({ retryable: true });
  expect(await exchange()).toBe(destination);
  const revoked = createEmailAccessExchange(token);
  await expect(revoked()).rejects.toMatchObject({ retryable: false });
  await expect(revoked()).rejects.toMatchObject({ retryable: false });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("refuses an external redirect or account mismatch and never leaves the loading gate", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: session("other") } });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: "recipient",
          reuseSession: true,
          destination: "https://evil.test",
        }),
      ),
    )
    .mockResolvedValue(
      new Response(JSON.stringify({ userId: "recipient", reuseSession: true, destination })),
    );
  vi.stubGlobal("fetch", fetchMock);
  await expect(createEmailAccessExchange(token)()).rejects.toMatchObject({ retryable: true });
  await expect(createEmailAccessExchange(token)()).rejects.toMatchObject({ retryable: true });
});
