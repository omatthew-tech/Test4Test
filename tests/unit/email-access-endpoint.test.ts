// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const endpointModule = "../../supabase/functions/_shared/redeem-email-link.ts";
const issuanceModule = "../../supabase/functions/_shared/email-access-links.ts";
const { redeemEmailLink } = await import(endpointModule);
const { createEmailDestinationLink, hashEmailAccessValue } = await import(issuanceModule);
const origin = "https://test4test.io";
const token = "ab".repeat(32);
const userId = "00000000-0000-4000-8000-000000000001";
const resourceId = "00000000-0000-4000-8000-000000000002";
let record: Record<string, unknown> | null;
let lease: boolean;
const rpc = vi.fn();
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const getUser = vi.fn();
const dependencies = {
  allowedOrigins: [origin],
  admin: { rpc, auth: { getUser, admin: { generateLink } } },
  verifier: { auth: { verifyOtp } },
};
function request(
  body: unknown = { token },
  method = "POST",
  browserOrigin = origin,
  bearer?: string,
) {
  return new Request(`${origin}/functions/v1/redeem-email-link`, {
    method,
    headers: {
      Origin: browserOrigin,
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  record = {
    id: "link",
    user_id: userId,
    email: "owner@example.test",
    destination: "feedback",
    resource_id: resourceId,
    entry: "feedback_email",
  };
  lease = false;
  rpc.mockImplementation(async (name: string) => {
    if (name === "resolve_email_access_link") return { data: record };
    if (name === "claim_email_access_session") {
      if (lease) return { data: false };
      lease = true;
      return { data: true };
    }
    if (name === "release_email_access_session") lease = false;
    return { data: true };
  });
  generateLink.mockResolvedValue({
    data: { user: { id: userId }, properties: { hashed_token: "one-time-auth-hash" } },
  });
  verifyOtp.mockResolvedValue({
    data: {
      session: {
        access_token: "session-token",
        refresh_token: "refresh-token",
        user: { id: userId },
      },
    },
  });
  getUser.mockResolvedValue({ data: { user: { id: userId } } });
});
it("issues independent 256-bit credentials, storing only hashes and server-owned targets", async () => {
  const env = {
    appBaseUrl: origin,
    emailAccessLinksEnabled: true,
    smtp2goAuthLinkApiKey: "dedicated",
    smtp2goAuthLinkTrackingDisabled: true,
  };
  const destination = { destination: "feedback", resource_id: resourceId, entry: "feedback_email" };
  const first = await createEmailDestinationLink(
    { rpc },
    env,
    { id: userId, email: "owner@example.test" },
    destination,
  );
  const second = await createEmailDestinationLink(
    { rpc },
    env,
    { id: userId, email: "owner@example.test" },
    destination,
  );
  const raw = new URL(first).hash.slice("#token=".length);
  expect(raw).toMatch(/^[a-f0-9]{64}$/);
  expect(second).not.toBe(first);
  expect(rpc.mock.calls[0]).toEqual([
    "issue_email_access_link",
    expect.objectContaining({
      p_token_hash: await hashEmailAccessValue(raw),
      p_user_id: userId,
      p_resource_id: resourceId,
    }),
  ]);
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(raw);
  await expect(
    createEmailDestinationLink(
      { rpc },
      { ...env, smtp2goAuthLinkApiKey: undefined },
      { id: userId, email: "owner@example.test" },
      destination,
    ),
  ).rejects.toThrow("tracking disabled");
});
it.each(["GET", "HEAD", "OPTIONS"])(
  "%s previews never authenticate or invoke the database",
  async (method) => {
    const response = await redeemEmailLink(request({}, method), dependencies);
    expect(response.status).toBe(method === "OPTIONS" ? 204 : 405);
    expect(rpc).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  },
);
it("rejects other origins, malformed credentials, and caller redirect/account overrides", async () => {
  expect(
    (await redeemEmailLink(request({ token }, "POST", "https://evil.test"), dependencies)).status,
  ).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  for (const body of [
    { token: "tampered" },
    { token, userId: "other" },
    { token, destination: "/admin" },
    { token: "a".repeat(1025) },
  ]) {
    expect((await redeemEmailLink(request(body), dependencies)).status).toBe(400);
  }
  expect(generateLink).not.toHaveBeenCalled();
});
it("creates a verified session without unlocking feedback, and reuses the durable link after logout", async () => {
  for (let i = 0; i < 3; i++) {
    const response = await redeemEmailLink(request(), dependencies);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      userId,
      reuseSession: false,
      destination: `/recordings?response=${resourceId}&earn_entry=feedback_email`,
      session: { refresh_token: "refresh-token" },
    });
  }
  expect(generateLink).toHaveBeenCalledTimes(3);
  expect(new Set(rpc.mock.calls.map(([name]) => name))).toEqual(
    new Set([
      "resolve_email_access_link",
      "check_email_access_rate_limit",
      "claim_email_access_session",
      "release_email_access_session",
    ]),
  );
});
it("reuses a verified matching session and switches a different signed-in account", async () => {
  const match = await redeemEmailLink(request({ token }, "POST", origin, "existing"), dependencies);
  expect(await match.json()).toMatchObject({ reuseSession: true, userId });
  expect(generateLink).not.toHaveBeenCalled();
  getUser.mockResolvedValueOnce({ data: { user: { id: "other-user" } } });
  const switched = await redeemEmailLink(
    request({ token }, "POST", origin, "other-session"),
    dependencies,
  );
  expect(await switched.json()).toMatchObject({ reuseSession: false, userId });
});
it("targets the exact test and retains attribution", async () => {
  record = { ...record, destination: "test", entry: "test_back_email", feedback_source: "earn" };
  const response = await redeemEmailLink(request(), dependencies);
  expect((await response.json()).destination).toBe(
    `/test/${resourceId}?earn_entry=test_back_email&feedback_source=earn`,
  );
});
it("serializes overlapping generation and permits a later retry", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  generateLink.mockImplementationOnce(async () => {
    await blocked;
    return { data: { user: { id: userId }, properties: { hashed_token: "one-time" } } };
  });
  const first = redeemEmailLink(request(), dependencies);
  await vi.waitFor(() => expect(generateLink).toHaveBeenCalledOnce());
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(503);
  release();
  expect((await first).status).toBe(200);
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(200);
});
it("rejects revoked records and rechecks revocation during exchange", async () => {
  record = null;
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(401);
  expect(generateLink).not.toHaveBeenCalled();
  record = {
    id: "link",
    user_id: userId,
    email: "owner@example.test",
    destination: "test",
    resource_id: resourceId,
    entry: "other_email",
  };
  verifyOtp.mockImplementationOnce(async () => {
    record = null;
    return {
      data: {
        session: { access_token: "session", refresh_token: "refresh", user: { id: userId } },
      },
    };
  });
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(401);
});
it("never returns a mismatched generated account or session", async () => {
  generateLink.mockResolvedValueOnce({
    data: { user: { id: "wrong" }, properties: { hashed_token: "token" } },
  });
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(503);
  expect(verifyOtp).not.toHaveBeenCalled();
  lease = false; // Simulate the failed exchange's lease expiring.
  verifyOtp.mockResolvedValueOnce({
    data: { session: { access_token: "wrong", user: { id: "wrong" } } },
  });
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(503);
});
it("redacts ambiguous provider failures, holds their lease until expiry, and throttles requests", async () => {
  generateLink.mockRejectedValueOnce(new Error(`secret ${token}`));
  const response = await redeemEmailLink(request(), dependencies);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(token);
  expect(lease).toBe(true);
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(503);
  expect(generateLink).toHaveBeenCalledOnce();
  lease = false; // The SQL lease-expiry path is covered by the database tests.
  expect((await redeemEmailLink(request(), dependencies)).status).toBe(200);
  expect(lease).toBe(false);
  rpc.mockResolvedValueOnce({ data: false });
  const throttled = await redeemEmailLink(request(), dependencies);
  expect(throttled.status).toBe(429);
  expect(throttled.headers.get("Retry-After")).toBe("60");
});
