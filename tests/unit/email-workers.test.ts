// @vitest-environment node
import { beforeEach, afterAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  templates: vi.fn(),
  send: vi.fn(),
  rpc: vi.fn(),
  loadFeedback: vi.fn(),
  processFeedback: vi.fn(),
  loadReminders: vi.fn(),
  processReminder: vi.fn(),
  loadShares: vi.fn(),
  processShare: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/email-system.ts", () => ({
  corsHeaders: {},
  createAdminClient: () => ({ rpc: mocks.rpc }),
  getEmailEnvironment: () => ({}),
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  loadEmailTemplates: mocks.templates,
  sendEmail: mocks.send,
  logEmailDelivery: vi.fn(),
  escapeHtml: (text: string) => text,
}));
vi.mock("../../supabase/functions/_shared/new-feedback-notifications.ts", () => ({
  newFeedbackTemplateKey: "new_feedback",
  loadUnnotifiedNewFeedbackResponses: mocks.loadFeedback,
  processNewFeedbackNotificationForResponse: mocks.processFeedback,
}));
vi.mock("../../supabase/functions/_shared/test-back-reminders.ts", () => ({
  reminderTemplateKeys: [
    "test_back_reminder_stage_1",
    "test_back_reminder_stage_2",
    "test_back_reminder_stage_3",
  ],
  loadDueReminderSequences: mocks.loadReminders,
  processReminderSequence: mocks.processReminder,
}));
vi.mock("../../supabase/functions/_shared/report-share-reminders.ts", () => ({
  reportShareReminderTemplateKeys: ["usability_report_share_reminder_1"],
  loadDueReportShareReminders: mocks.loadShares,
  processReportShareReminder: mocks.processShare,
}));
const handlers: Array<(request: Request) => Promise<Response>> = [];
vi.stubGlobal("Deno", {
  env: { get: () => "test-secret" },
  serve: (handler: (request: Request) => Promise<Response>) => handlers.push(handler),
});
const reminderModule = "../../supabase/functions/send-test-back-reminders/index.ts";
const googleModule = "../../supabase/functions/send-google-play-closed-test-reminders/index.ts";
await import(reminderModule);
await import(googleModule);
const [reminders, google] = handlers;
const request = (body: object = {}, secret = "test-secret") =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "x-reminder-secret": secret },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.templates.mockResolvedValue(new Map());
  mocks.loadFeedback.mockResolvedValue([]);
  mocks.loadReminders.mockResolvedValue([]);
  mocks.loadShares.mockResolvedValue([]);
  mocks.processFeedback.mockResolvedValue({ outcome: "sent" });
  mocks.processReminder.mockResolvedValue({ outcome: "sent" });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "mark_missed_google_play_closed_tests" ? 0 : [],
    error: null,
  }));
});
afterAll(() => vi.unstubAllGlobals());

it("selects reminder stages after feedback advances the sequence", async () => {
  const operations: string[] = [];
  mocks.loadFeedback.mockResolvedValue([{ id: "feedback" }]);
  mocks.processFeedback.mockImplementation(async () => {
    operations.push("feedback");
    return { outcome: "sent" };
  });
  mocks.loadReminders.mockImplementation(async () => {
    operations.push("load reminders");
    return [];
  });
  expect((await reminders(request())).status).toBe(200);
  expect(operations).toEqual(["feedback", "load reminders"]);
});

it("returns a failure status when an individual sequence fails", async () => {
  mocks.loadReminders.mockResolvedValue([{ id: "broken" }]);
  mocks.processReminder.mockRejectedValue(new Error("Database failure"));
  const response = await reminders(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ ok: false, errors: ["Database failure"] });
});

it("preserves the deployed shared-report reminder processing", async () => {
  mocks.loadShares.mockResolvedValue([{ id: "existing-share" }]);
  mocks.processShare.mockResolvedValue({ outcome: "sent" });
  expect(await (await reminders(request())).json()).toMatchObject({ ok: true, reportShareSent: 1 });
  expect(mocks.processShare).toHaveBeenCalledTimes(1);
});

it("provides an authenticated read-only check without processing notifications", async () => {
  mocks.loadFeedback.mockResolvedValue([{ id: "feedback" }]);
  mocks.loadReminders.mockResolvedValue([{ id: "reminder" }]);
  expect(await (await reminders(request({ dryRun: true }))).json()).toMatchObject({
    ok: true,
    dryRun: true,
    feedbackDue: 1,
    remindersDue: 1,
  });
  expect(mocks.processFeedback).not.toHaveBeenCalled();
  expect(mocks.processReminder).not.toHaveBeenCalled();
  expect(mocks.processShare).not.toHaveBeenCalled();
});

it("rejects unauthorized delivery and diagnostic requests", async () => {
  for (const handler of [reminders, google]) {
    expect((await handler(request({ dryRun: true }, "wrong-secret"))).status).toBe(401);
  }
  expect(mocks.loadReminders).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("handles an empty Google Play batch without querying profiles or sending", async () => {
  expect(await (await google(request())).json()).toMatchObject({ ok: true, processed: 0, sent: 0 });
  expect(mocks.rpc).toHaveBeenCalledWith(
    "list_due_google_play_reminders",
    expect.objectContaining({ p_limit: 50 }),
  );
  expect(mocks.send).not.toHaveBeenCalled();
});

it("checks Google Play registration without marking missed tests or sending mail", async () => {
  expect(await (await google(request({ dryRun: true }))).json()).toMatchObject({
    ok: true,
    dryRun: true,
    remindersDue: 0,
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.templates).toHaveBeenCalledWith(expect.anything(), [
    "google_play_closed_test_check_in_reminder",
  ]);
  expect(mocks.send).not.toHaveBeenCalled();
});

it("stops before SMTP if the Google Play delivery-log key is missing", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "mark_missed_google_play_closed_tests" ? 0 : [{ id: "due" }],
    error: null,
  }));
  mocks.templates.mockRejectedValueOnce(new Error("Missing email template"));
  await expect(google(request())).rejects.toThrow("Missing email template");
  expect(mocks.send).not.toHaveBeenCalled();
});
