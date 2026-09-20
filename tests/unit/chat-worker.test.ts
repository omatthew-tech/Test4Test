// @vitest-environment node
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  log: vi.fn(),
  secret: "test-secret",
}));
vi.mock("../../supabase/functions/_shared/email-system.ts", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
  getEmailEnvironment: () => ({ appBaseUrl: "https://test4test.io" }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  logEmailDelivery: mocks.log,
  sendEmail: mocks.send,
}));
let handler: (request: Request) => Promise<Response>;
const job = { id: "job", lease_id: "lease", recipient_user_id: "tester", attempt_count: 1 };
const context = {
  email: "tester@example.test",
  productName: "Example app",
  body: "Private message",
  founderSent: true,
  conversationId: "thread",
  submissionId: "app",
  stage: 0,
};
beforeAll(async () => {
  vi.stubGlobal("Deno", { env: { get: () => mocks.secret } });
  const path = "../../supabase/functions/dispatch-chat-notifications/index.ts";
  handler = (await import(path)).dispatchChatNotifications;
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ providerMessageId: "provider-id" });
  mocks.log.mockReset().mockResolvedValue(undefined);
  mocks.rpc.mockReset().mockImplementation(async (name: string) => ({
    data:
      name === "claim_chat_notifications"
        ? [job]
        : name === "chat_notification_context"
          ? context
          : true,
    error: null,
  }));
});
const request = (secret = "test-secret") =>
  new Request("https://example.test/worker", {
    method: "POST",
    headers: { "x-chat-dispatch-secret": secret },
  });
it("rejects unauthenticated worker calls before accessing the queue", async () => {
  expect((await handler(request("wrong"))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("records provider success before logging and does not retry a send when logging fails", async () => {
  mocks.log.mockRejectedValue(new Error("Logging offline"));
  expect(await (await handler(request())).json()).toMatchObject({ sent: 1, failed: 0 });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    "finish_chat_notification",
    expect.objectContaining({ p_provider_id: "provider-id", p_error: null }),
  );
  expect(mocks.rpc.mock.invocationCallOrder[2]).toBeLessThan(mocks.log.mock.invocationCallOrder[0]);
});
it("preserves provider-confirmed success when the provider omits a delivery ID", async () => {
  mocks.send.mockResolvedValue({ providerMessageId: null });
  expect(await (await handler(request())).json()).toMatchObject({ sent: 1 });
  expect(mocks.log).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "sent" }),
  );
});
it("rechecks cancelled reminders and never sends their email", async () => {
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === "claim_chat_notifications" ? [job] : null,
    error: null,
  }));
  expect(await (await handler(request())).json()).toMatchObject({ cancelled: 1 });
  expect(mocks.send).not.toHaveBeenCalled();
});
it("leaves failures to durable backoff and never persists private provider errors", async () => {
  mocks.send.mockRejectedValue(new Error("Provider rejected Private message"));
  expect(await (await handler(request())).json()).toMatchObject({ failed: 1, sent: 0 });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    "finish_chat_notification",
    expect.objectContaining({ p_error: "Chat notification delivery failed." }),
  );
  expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("Private message");
});
