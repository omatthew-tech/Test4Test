// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("npm:@supabase/supabase-js@2", () => ({ createClient: vi.fn() }));
const helpers = vi.hoisted(() => ({ send: vi.fn(), log: vi.fn(), templates: vi.fn() }));
vi.mock("../../supabase/functions/_shared/email-system.ts", async (original) => ({
  ...(await original()),
  sendEmail: helpers.send,
  logEmailDelivery: helpers.log,
  loadEmailTemplates: helpers.templates,
}));
const workerPath = "../../supabase/functions/_shared/new-user-followups.ts";
const emailPath = "../../supabase/functions/_shared/email-system.ts";
const { runNewUserFollowups } = await import(workerPath);
const { EmailDeliveryError } = await import(emailPath);
let rpc: ReturnType<typeof vi.fn>;
let connect: ReturnType<typeof vi.fn>;
const request = (body: unknown = {}, secret = "secret") =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "x-reminder-secret": secret },
    body: JSON.stringify(body),
  });
const run = (req = request()) => runNewUserFollowups(req, { secret: "secret", connect });
beforeEach(() => {
  vi.clearAllMocks();
  helpers.send.mockResolvedValue({ providerMessageId: "provider" });
  helpers.log.mockResolvedValue(undefined);
  helpers.templates.mockResolvedValue(
    new Map([
      [
        "new_user_inactivity_followup",
        {
          subject_template: "Question about Test4Test?",
          text_template: "copy",
          html_template: "<strong>copy</strong>",
        },
      ],
    ]),
  );
  rpc = vi.fn(async (_name, args) => ({
    error: null,
    data:
      args.p_action === "claim"
        ? [{ user_id: "user", lease_id: "lease" }]
        : args.p_action === "begin"
          ? { email: "new@example.test", submissionId: "app" }
          : args.p_action === "inspect"
            ? { enabled: false, due: 0 }
            : true,
  }));
  connect = vi.fn(() => ({ admin: { rpc }, env: { smtp2goApiKey: "test" } }));
});
afterEach(() => vi.unstubAllGlobals());
it("rejects invalid callers and malformed requests before DB or SMTP access", async () => {
  expect((await run(request({}, "wrong"))).status).toBe(401);
  expect((await run(request({ dryRun: "yes" }))).status).toBe(400);
  expect((await run(new Request("https://example.test"))).status).toBe(405);
  expect(connect).not.toHaveBeenCalled();
});
it("dry-runs read-only readiness and verifies the sender domain without email sends", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      data: {
        domains: [
          {
            domain: {
              fulldomain: "test4test.io",
              dkim_verified: true,
              rpath_verified: true,
            },
          },
        ],
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await run(request({ dryRun: true }));
  expect(await result.json()).toMatchObject({
    ok: true,
    dryRun: true,
    enabled: false,
    senderVerified: true,
  });
  expect(rpc.mock.calls.map((c) => c[1].p_action)).toEqual(["inspect"]);
  expect(helpers.send).not.toHaveBeenCalled();
  expect(helpers.log).not.toHaveBeenCalled();
});
it("rechecks, sends from Matt with Reply-To, and commits success before best-effort logging", async () => {
  helpers.log.mockRejectedValue(new Error("log failed"));
  expect((await run()).status).toBe(200);
  expect(helpers.send).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      sender: { name: "Matt @ Test4Test", email: "Matt@Test4Test.io" },
      replyTo: "Matt@Test4Test.io",
      subject: "Question about Test4Test?",
    }),
  );
  expect(rpc.mock.calls.map((c) => c[1].p_action)).toEqual(["claim", "begin", "finish"]);
  expect(rpc.mock.calls[2][1]).toMatchObject({ p_outcome: "sent", p_provider_id: "provider" });
  expect(rpc.mock.invocationCallOrder[2]).toBeLessThan(helpers.log.mock.invocationCallOrder[0]);
});
it("does not send when eligibility changes after claim", async () => {
  rpc.mockImplementation(async (_name, args) => ({
    error: null,
    data: args.p_action === "claim" ? [{ user_id: "u", lease_id: "l" }] : null,
  }));
  expect(await (await run()).json()).toMatchObject({ cancelled: 1 });
  expect(helpers.send).not.toHaveBeenCalled();
});
it.each(["rejected", "unknown"])(
  "records %s delivery outcomes without a tight retry loop",
  async (outcome) => {
    helpers.send.mockRejectedValue(new EmailDeliveryError("private upstream data", outcome));
    const result = await run();
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("private");
    expect(rpc.mock.calls[2][1].p_outcome).toBe(outcome);
    expect(helpers.send).toHaveBeenCalledTimes(1);
  },
);
it("quarantines transport failures and doesn't replay accepted mail when completion fails", async () => {
  helpers.send.mockRejectedValueOnce(new TypeError("network failed"));
  await run();
  expect(rpc.mock.calls[2][1].p_outcome).toBe("unknown");
  rpc.mockClear();
  rpc.mockImplementation(async (_name, args) => ({
    data:
      args.p_action === "claim"
        ? [{ user_id: "u", lease_id: "l" }]
        : args.p_action === "begin"
          ? { email: "new@example.test", submissionId: "app" }
          : null,
    error: args.p_action === "finish" ? { message: "offline" } : null,
  }));
  expect((await run()).status).toBe(502);
  expect(rpc.mock.calls.filter((c) => c[1].p_action === "finish")).toHaveLength(1);
  expect(helpers.log).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "sent" }),
  );
});
