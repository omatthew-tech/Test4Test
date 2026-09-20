// @vitest-environment node
import { beforeEach, afterAll, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ send: vi.fn(), log: vi.fn(), admin: null as any }));
vi.mock("../../supabase/functions/_shared/email-system.ts", () => ({
  corsHeaders: {},
  createAdminClient: () => mocked.admin,
  getEmailEnvironment: () => ({ appBaseUrl: "https://example.test" }),
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  loadEmailTemplates: async () => new Map([["tip_payment_method_added", {}]]),
  renderEmailTemplate: () => ({
    subject: "Payment methods added",
    textBody: "Ready",
    htmlBody: "Ready",
  }),
  sendEmail: mocked.send,
  logEmailDelivery: mocked.log,
  escapeHtml: (text: string) => text,
}));
const handlers: Array<(request: Request) => Promise<Response>> = [];
vi.stubGlobal("Deno", {
  env: { get: () => undefined },
  serve: (handler: (request: Request) => Promise<Response>) => handlers.push(handler),
});
const moderationModule = "../../supabase/functions/manage-test-reports/index.ts";
const tipModule = "../../supabase/functions/send-tip-payment-method-added/index.ts";
const { decideReport } = await import(moderationModule);
await import(tipModule);
const tipHandler = handlers[1];
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
beforeEach(() => {
  vi.clearAllMocks();
  tables = {
    submission_reports: [
      {
        id: "report",
        submission_id: "app",
        reporter_user_id: "tester",
        status: "confirmed",
        reason: "app_unavailable",
        message: "Unavailable",
        credited_transaction_id: "existing-credit",
      },
    ],
    submissions: [{ id: "app", user_id: "founder", product_name: "App" }],
    profiles: [
      { id: "founder", email: "founder@example.test", display_name: "Founder" },
      {
        id: "tester",
        email: "tester@example.test",
        display_name: "Tester",
        paypal_handle: "tester",
      },
    ],
    email_delivery_logs: [],
  };
  mocked.admin = {
    auth: { getUser: async () => ({ data: { user: { id: "tester" } }, error: null }) },
    from: (table: string) => {
      const predicates: Array<(row: Row) => boolean> = [];
      const result = () => ({
        data: (tables[table] ?? []).filter((row) =>
          predicates.every((predicate) => predicate(row)),
        ),
        error: null,
      });
      const query: any = {
        select: () => query,
        order: () => query,
        limit: () => query,
        eq: (key: string, value: unknown) => {
          predicates.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          predicates.push((row) => values.includes(row[key]));
          return query;
        },
        contains: (key: string, values: Row) => {
          predicates.push((row) =>
            Object.entries(values).every(([nested, value]) => row[key]?.[nested] === value),
          );
          return query;
        },
        single: async () => ({ ...result(), data: result().data[0] ?? null }),
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
        update: () => {
          throw new Error("Retry must not change a saved decision or app");
        },
        insert: () => {
          throw new Error("Retry must not award another credit");
        },
      };
      return query;
    },
  };
  mocked.send.mockResolvedValue({ providerMessageId: "provider-id" });
  mocked.log.mockImplementation(async (_admin, value) => {
    tables.email_delivery_logs.push({
      id: crypto.randomUUID(),
      template_key: value.templateKey,
      recipient_user_id: value.recipientUserId,
      related_response_id: value.relatedResponseId,
      status: value.status,
      metadata: value.metadata,
    });
  });
});
afterAll(() => vi.unstubAllGlobals());

it("retries only the missing moderation email after a partial send", async () => {
  mocked.send.mockImplementation(async (_env, message) => {
    if (message.to === "founder@example.test") throw new Error("SMTP unavailable");
    return { providerMessageId: "sent-to-reporter" };
  });
  const retry = () =>
    decideReport(
      mocked.admin,
      { appBaseUrl: "https://example.test" },
      { id: "support" },
      "report",
      "not_ok",
    );
  await expect(retry()).rejects.toThrow("SMTP unavailable");
  expect(mocked.send).toHaveBeenCalledTimes(2);
  mocked.send.mockResolvedValue({ providerMessageId: "sent-to-founder" });
  await expect(retry()).resolves.toMatchObject({ skipped: false });
  expect(mocked.send).toHaveBeenCalledTimes(3);
  expect(mocked.send.mock.calls[2][1].to).toBe("founder@example.test");
  await retry();
  expect(mocked.send).toHaveBeenCalledTimes(3);
});

it("retries a dismissed report email without changing its decision", async () => {
  tables.submission_reports[0].status = "dismissed";
  await decideReport(
    mocked.admin,
    { appBaseUrl: "https://example.test" },
    { id: "support" },
    "report",
    "ok",
  );
  expect(mocked.send).toHaveBeenCalledTimes(1);
  expect(mocked.send.mock.calls[0][1].subject).toBe("We reviewed your report for App");
});

it("does not reverse a completed decision while retrying", async () => {
  await expect(
    decideReport(mocked.admin, {}, { id: "support" }, "report", "ok"),
  ).resolves.toMatchObject({ skipped: true });
  expect(mocked.send).not.toHaveBeenCalled();
});

it("reports failed tip notifications as failures and supports a later retry", async () => {
  tables.email_delivery_logs.push({
    id: "tip-request",
    template_key: "tip_payment_method_request",
    recipient_user_id: "tester",
    related_response_id: "response",
    related_submission_id: "app",
    status: "sent",
    metadata: { founderUserId: "founder" },
  });
  const request = () =>
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer test-session" },
      body: "{}",
    });
  mocked.send.mockRejectedValueOnce(new Error("SMTP unavailable"));
  const failed = await tipHandler(request());
  expect(failed.status).toBe(502);
  expect(await failed.json()).toMatchObject({ ok: false, failedCount: 1, notifiedCount: 0 });
  const success = await tipHandler(request());
  expect(success.status).toBe(200);
  expect(await success.json()).toMatchObject({ ok: true, failedCount: 0, notifiedCount: 1 });
  await tipHandler(request());
  expect(mocked.send).toHaveBeenCalledTimes(2);
});
