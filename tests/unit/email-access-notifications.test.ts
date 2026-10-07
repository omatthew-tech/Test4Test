// @vitest-environment node
import { afterAll, beforeEach, expect, it, vi } from "vitest";
type Row = Record<string, any>;
const mocks = vi.hoisted(() => ({ admin: null as any, send: vi.fn(), log: vi.fn() }));
vi.mock("../../supabase/functions/_shared/email-system.ts", () => ({
  createAdminClient: () => mocks.admin,
  getEmailEnvironment: () => environment,
  sendEmail: mocks.send,
  logEmailDelivery: mocks.log,
  loadEmailTemplates: async () =>
    new Map([
      ["new_feedback", {}],
      ["google_play_closed_test_check_in_reminder", {}],
    ]),
  renderEmailTemplate: (_template: unknown, variables: Record<string, string>) => ({
    subject: "Feedback",
    textBody: variables.feedbackUrl,
    htmlBody: `<a href="${variables.feedbackUrl}">View feedback</a>`,
  }),
  escapeHtml: (value: string) => value,
  corsHeaders: {},
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
}));
const environment = {
  appBaseUrl: "https://test4test.io",
  emailAccessLinksEnabled: true,
  smtp2goAuthLinkApiKey: "untracked",
  smtp2goAuthLinkTrackingDisabled: true,
};
let google: (request: Request) => Promise<Response>;
vi.stubGlobal("Deno", {
  env: { get: () => "cron-secret" },
  serve: (handler: typeof google) => {
    google = handler;
  },
});
const googleModule = "../../supabase/functions/send-google-play-closed-test-reminders/index.ts";
const feedbackModule = "../../supabase/functions/_shared/new-feedback-notifications.ts";
await import(googleModule);
const { processNewFeedbackNotificationForResponse } = await import(feedbackModule);
let tables: Record<string, Row[]>;
let issued: Row[];
beforeEach(() => {
  vi.clearAllMocks();
  issued = [];
  tables = {
    profiles: [
      { id: "owner", email: "owner@example.test", display_name: "Owner" },
      { id: "tester", email: "tester@example.test", display_name: "Tester" },
    ],
    submissions: [{ id: "app", user_id: "owner", product_name: "Example App" }],
    test_responses: [
      {
        id: "response",
        submission_id: "app",
        tester_user_id: null,
        public_tester_key: "public",
        status: "approved",
        credit_awarded: false,
        owner_notified_at: null,
      },
    ],
    email_delivery_logs: [],
    google_play_closed_test_check_ins: [],
  };
  mocks.admin = {
    rpc: async (name: string, args: Row) => {
      if (name === "issue_email_access_link") issued.push(args);
      return {
        data:
          name === "list_due_google_play_reminders"
            ? [
                {
                  id: "participation",
                  tester_user_id: "tester",
                  submission_id: "app",
                  required_days: 14,
                },
              ]
            : 0,
      };
    },
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      let changes: Row | undefined;
      const result = () => {
        const data = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        if (changes) data.forEach((row) => Object.assign(row, changes));
        return { data, count: data.length, error: null };
      };
      const builder: any = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return builder;
        },
        is: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return builder;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return builder;
        },
        gte: (key: string, value: string) => {
          filters.push((row) => row[key] >= value);
          return builder;
        },
        update: (value: Row) => {
          changes = value;
          return builder;
        },
        single: async () => ({ ...result(), data: result().data[0] }),
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    },
  };
  mocks.send.mockResolvedValue({ providerMessageId: "sent" });
  mocks.log.mockImplementation(async (_admin, log) =>
    tables.email_delivery_logs.push({
      id: "delivery",
      created_at: new Date().toISOString(),
      status: log.status,
      template_key: log.templateKey,
      related_response_id: log.relatedResponseId,
      related_submission_id: log.relatedSubmissionId,
      recipient_user_id: log.recipientUserId,
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
it("sends an exact feedback credential and reconciles delivery retries without issuing again", async () => {
  await processNewFeedbackNotificationForResponse(mocks.admin, environment, {
    ...tables.test_responses[0],
  });
  expect(issued).toEqual([
    expect.objectContaining({
      p_user_id: "owner",
      p_destination: "feedback",
      p_resource_id: "response",
      p_entry: "feedback_email",
    }),
  ]);
  const sent = mocks.send.mock.calls[0][1];
  expect(sent.textBody).toMatch(/\/email-access#token=[a-f0-9]{64}$/);
  expect(sent.htmlBody).toContain(sent.textBody);
  expect(sent.containsAuthenticationLink).toBe(true);
  tables.test_responses[0].owner_notified_at = null;
  expect(
    await processNewFeedbackNotificationForResponse(mocks.admin, environment, {
      ...tables.test_responses[0],
    }),
  ).toMatchObject({ outcome: "skipped", reason: "already_sent" });
  expect(issued).toHaveLength(1);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("#token=");
});
it("sends a Google Play credential to the tester and preserves same-day deduplication", async () => {
  const run = () =>
    google(
      new Request("https://test4test.io", {
        method: "POST",
        headers: { "x-reminder-secret": "cron-secret" },
        body: "{}",
      }),
    );
  expect(await (await run()).json()).toMatchObject({ sent: 1 });
  expect(issued).toEqual([
    expect.objectContaining({
      p_user_id: "tester",
      p_destination: "test",
      p_resource_id: "app",
      p_entry: "other_email",
      p_feedback_source: null,
    }),
  ]);
  const sent = mocks.send.mock.calls[0][1];
  const link = sent.textBody.match(/https:\/\/test4test.io\/email-access#token=[a-f0-9]{64}/)?.[0];
  expect(link).toBeTruthy();
  expect(sent.htmlBody).toContain(`href="${link}"`);
  expect(sent.containsAuthenticationLink).toBe(true);
  expect(await (await run()).json()).toMatchObject({ sent: 0, skipped: 1 });
  expect(issued).toHaveLength(1);
  expect(mocks.send).toHaveBeenCalledOnce();
});
