// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const email = vi.hoisted(() => ({ send: vi.fn(), log: vi.fn(), render: vi.fn() }));
vi.mock("../../supabase/functions/_shared/email-system.ts", () => ({
  sendEmail: email.send,
  logEmailDelivery: email.log,
  loadEmailTemplates: async () => templates,
  renderEmailTemplate: (...args: unknown[]) => {
    email.render(...args);
    return {
      subject: "Reminder",
      textBody: "Test back",
      htmlBody: "Test back",
    };
  },
}));
const modulePath = "../../supabase/functions/_shared/test-back-reminders.ts";
const { processReminderSequence, loadDueReminderSequences } = await import(modulePath);
const templates = new Map(
  [1, 2, 3].map((stage) => [
    `test_back_reminder_stage_${stage}`,
    {
      key: `test_back_reminder_stage_${stage}`,
      subject_template: "Reminder",
      text_template: "Test back",
      html_template: "Test back",
    },
  ]),
);
type Row = Record<string, any>;

// Models the relevant PostgREST behavior, including atomic conditional updates
// and the production NOT NULL constraint that caused the incident.
class FakeDatabase {
  tables: Record<string, Row[]> = {};
  failTargetRead = false;
  targetUnavailable = false;
  failTargetRpc = false;
  rpcCalls: Array<{ name: string; args: Row }> = [];
  from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let changes: Row | undefined;
    let maximum = Infinity;
    let order: [string, boolean] | undefined;
    const run = () => {
      if (this.failTargetRead && table === "submissions" && !changes) {
        return { data: null, error: { message: "Temporary database failure" } };
      }
      let matches = (this.tables[table] ?? []).filter((row) =>
        filters.every((filter) => filter(row)),
      );
      if (order) {
        const [key, ascending] = order;
        matches.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
      }
      matches = matches.slice(0, maximum);
      if (changes && table === "test_back_reminder_sequences" && changes.next_send_at === null) {
        return {
          data: null,
          error: { message: "null value in column next_send_at violates not-null constraint" },
        };
      }
      if (changes) matches.forEach((row) => Object.assign(row, changes));
      return { data: matches.map((row) => ({ ...row })), error: null };
    };
    const builder: any = {
      select: () => builder,
      update: (value: Row) => {
        changes = value;
        return builder;
      },
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return builder;
      },
      lte: (key: string, value: string) => {
        filters.push((row) => row[key] <= value);
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return builder;
      },
      is: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return builder;
      },
      order: (key: string, options: { ascending: boolean }) => {
        order = [key, options.ascending];
        return builder;
      },
      limit: (value: number) => {
        maximum = value;
        return builder;
      },
      maybeSingle: async () => {
        const result = run();
        return { ...result, data: result.data?.[0] ?? null };
      },
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }
  async rpc(name: string, args: Row) {
    this.rpcCalls.push({ name, args });
    if (name === "find_test_back_target_submission") {
      if (this.failTargetRpc) {
        return { data: null, error: { message: "Target lookup failed" } };
      }
      const target = this.tables.submissions.find((row) => row.user_id === args.p_tester_user_id);
      return {
        data:
          target && !this.targetUnavailable
            ? [{ submission_id: target.id, product_name: target.product_name }]
            : [],
        error: null,
      };
    }
    return {
      data: [{ current_test_back_rate_percent: 100, new_test_back_rate_percent: 50 }],
      error: null,
    };
  }
}

let db: FakeDatabase;
let reminder: Row;
const env = { appBaseUrl: "https://example.test" };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T18:00:00Z"));
  email.send.mockReset().mockResolvedValue({ providerMessageId: "provider-1" });
  email.log.mockReset();
  email.render.mockReset();
  db = new FakeDatabase();
  reminder = {
    id: "sequence",
    owner_user_id: "owner",
    tester_user_id: "tester",
    latest_triggering_response_id: "response",
    latest_triggering_submission_id: "owner-app",
    status: "pending",
    emails_sent: 2,
    next_send_at: "2026-05-01T00:00:00.000Z",
  };
  db.tables.test_back_reminder_sequences = [{ ...reminder }];
  db.tables.profiles = [
    { id: "owner", email: "owner@example.test", display_name: "Owner", ban_status: "clear" },
    { id: "tester", email: "tester@example.test", display_name: "Tester", ban_status: "clear" },
  ];
  db.tables.submissions = [
    {
      id: "owner-app",
      user_id: "owner",
      product_name: "Owner app",
      status: "live",
      is_open_for_more_tests: true,
      needs_google_play_closed_testers: false,
    },
    {
      id: "tester-app",
      user_id: "tester",
      product_name: "Tester app",
      status: "live",
      is_open_for_more_tests: true,
      needs_google_play_closed_testers: false,
    },
  ];
  db.tables.test_responses = [];
  db.tables.email_delivery_logs = [];
});
afterEach(() => vi.useRealTimers());

it("issues separate reusable feedback and exact test-back links when enabled", async () => {
  await processReminderSequence(
    db,
    {
      ...env,
      emailAccessLinksEnabled: true,
      smtp2goAuthLinkApiKey: "untracked-key",
      smtp2goAuthLinkTrackingDisabled: true,
    },
    reminder,
    templates,
  );
  const issued = db.rpcCalls.filter((call) => call.name === "issue_email_access_link");
  expect(issued).toHaveLength(2);
  expect(issued.map((call) => call.args)).toEqual([
    expect.objectContaining({
      p_user_id: "owner",
      p_destination: "feedback",
      p_resource_id: "response",
      p_entry: "test_back_email",
    }),
    expect.objectContaining({
      p_user_id: "owner",
      p_destination: "test",
      p_resource_id: "tester-app",
      p_entry: "test_back_email",
      p_feedback_source: "earn",
    }),
  ]);
  const variables = email.render.mock.calls[0][1];
  expect(variables.feedbackUrl).toMatch(/\/email-access#token=[a-f0-9]{64}$/);
  expect(variables.testBackUrl).not.toBe(variables.feedbackUrl);
  expect(email.send.mock.calls[0][1].containsAuthenticationLink).toBe(true);
  expect(JSON.stringify(email.log.mock.calls)).not.toContain("#token=");
});

it("reconciles an already-delivered final reminder without sending again", async () => {
  db.tables.email_delivery_logs.push({
    reminder_sequence_id: "sequence",
    related_response_id: "response",
    template_key: "test_back_reminder_stage_3",
    status: "sent",
    created_at: "2026-05-02T00:00:00.000Z",
  });
  await processReminderSequence(db, env, reminder, templates);
  expect(email.send).not.toHaveBeenCalled();
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "resolved",
    emails_sent: 3,
    resolved_reason: "sequence_complete",
    affects_test_back_rate: true,
    next_send_at: "2026-05-02T00:00:00.000Z",
  });
});

it("cancels a missing target without violating the date constraint", async () => {
  db.tables.submissions = db.tables.submissions.filter((row) => row.id !== "tester-app");
  await expect(processReminderSequence(db, env, reminder, templates)).resolves.toMatchObject({
    outcome: "cancelled",
  });
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "cancelled",
    resolved_reason: "missing_target_submission",
    next_send_at: "2026-09-20T18:00:00.000Z",
  });
  expect(email.send).not.toHaveBeenCalled();
});

it("resolves an exchange that was already reciprocated without emailing", async () => {
  db.tables.test_responses.push({
    id: "returned-test",
    tester_user_id: "owner",
    submission_id: "tester-app",
    status: "approved",
    credit_awarded: true,
  });
  await expect(processReminderSequence(db, env, reminder, templates)).resolves.toMatchObject({
    outcome: "resolved",
    reason: "tested_back",
  });
  expect(db.tables.test_back_reminder_sequences[0].next_send_at).toBeTruthy();
  expect(email.send).not.toHaveBeenCalled();
});

it("finishes a newly delivered final reminder and logs it once", async () => {
  await processReminderSequence(db, env, reminder, templates);
  expect(email.send).toHaveBeenCalledTimes(1);
  expect(email.log).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ templateKey: "test_back_reminder_stage_3", status: "sent" }),
  );
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "resolved",
    emails_sent: 3,
    next_send_at: "2026-09-20T18:00:00.000Z",
  });
});

it("allows only one overlapping worker to send a due reminder", async () => {
  const results = await Promise.all([
    processReminderSequence(db, env, { ...reminder }, templates),
    processReminderSequence(db, env, { ...reminder }, templates),
  ]);
  expect(email.send).toHaveBeenCalledTimes(1);
  expect(results.some((result) => result.outcome === "skipped")).toBe(true);
});

it("skips a stale batch entry after feedback has advanced the initial stage", async () => {
  reminder.emails_sent = 0;
  Object.assign(db.tables.test_back_reminder_sequences[0], {
    emails_sent: 1,
    next_send_at: "2026-09-21T18:00:00.000Z",
  });
  await expect(processReminderSequence(db, env, reminder, templates)).resolves.toMatchObject({
    outcome: "skipped",
  });
  expect(email.send).not.toHaveBeenCalled();
});

it("defers a failing record so newer due work can enter the next batch", async () => {
  db.failTargetRead = true;
  await expect(processReminderSequence(db, env, reminder, templates)).rejects.toThrow(
    "Temporary database failure",
  );
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "pending",
    emails_sent: 2,
    next_send_at: "2026-09-20T19:00:00.000Z",
  });
  db.tables.test_back_reminder_sequences.push({
    ...reminder,
    id: "newer-sequence",
    next_send_at: "2026-09-20T17:00:00.000Z",
  });
  expect((await loadDueReminderSequences(db, 1))[0].id).toBe("newer-sequence");
});

it("keeps the 24-hour spacing after a successful non-final reminder", async () => {
  reminder.emails_sent = 1;
  db.tables.test_back_reminder_sequences[0].emails_sent = 1;
  await processReminderSequence(db, env, reminder, templates);
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "pending",
    emails_sent: 2,
    next_send_at: "2026-09-21T18:00:00.000Z",
  });
});

it("uses server eligibility even when a target still exists locally", async () => {
  db.targetUnavailable = true;
  await expect(processReminderSequence(db, env, reminder, templates)).resolves.toMatchObject({
    outcome: "cancelled",
    reason: "missing_target_submission",
  });
  expect(db.rpcCalls).toEqual([
    {
      name: "find_test_back_target_submission",
      args: { p_tester_user_id: "tester", p_owner_user_id: "owner" },
    },
  ]);
  expect(email.send).not.toHaveBeenCalled();
  expect(db.tables.test_back_reminder_sequences[0].affects_test_back_rate).toBeUndefined();
});

it("defers an eligibility lookup error instead of cancelling or sending", async () => {
  db.failTargetRpc = true;
  await expect(processReminderSequence(db, env, reminder, templates)).rejects.toThrow(
    "Target lookup failed",
  );
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "pending",
    emails_sent: 2,
    next_send_at: "2026-09-20T19:00:00.000Z",
  });
  expect(email.send).not.toHaveBeenCalled();
});

it("renders final reminder rates from the database transition and the shared target", async () => {
  await processReminderSequence(db, env, reminder, templates);
  expect(email.render).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      currentTestBackRatePercent: "100",
      newTestBackRatePercent: "50",
      testBackUrl:
        "https://example.test/test/tester-app?earn_entry=test_back_email&feedback_source=earn",
    }),
  );
});

it("reconciles a delivered final reminder after a target becomes unavailable without resending", async () => {
  db.targetUnavailable = true;
  db.tables.email_delivery_logs.push({
    reminder_sequence_id: "sequence",
    related_response_id: "response",
    template_key: "test_back_reminder_stage_3",
    status: "sent",
    created_at: "2026-05-02T00:00:00.000Z",
  });
  await processReminderSequence(db, env, reminder, templates);
  expect(email.send).not.toHaveBeenCalled();
  expect(db.tables.test_back_reminder_sequences[0]).toMatchObject({
    status: "resolved",
    emails_sent: 3,
    affects_test_back_rate: true,
  });
});
