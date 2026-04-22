import {
  corsHeaders,
  createAdminClient,
  getEmailEnvironment,
  json,
  loadEmailTemplates,
} from "../_shared/email-system.ts";
import {
  loadUnnotifiedNewFeedbackResponses,
  newFeedbackTemplateKey,
  processNewFeedbackNotificationForResponse,
} from "../_shared/new-feedback-notifications.ts";
import {
  loadDueReminderSequences,
  processReminderSequence,
  reminderTemplateKeys,
} from "../_shared/test-back-reminders.ts";

interface ReminderRunRequest {
  limit?: number;
  feedbackLimit?: number;
  feedbackLookbackHours?: number;
}

function getSuppliedSecret(request: Request) {
  const directHeader = request.headers.get("x-reminder-secret")?.trim();

  if (directHeader) {
    return directHeader;
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("TEST_BACK_REMINDER_CRON_SECRET")?.trim() ?? "";

  if (!expectedSecret) {
    return json({ error: "Missing reminder cron secret." }, 500);
  }

  const suppliedSecret = getSuppliedSecret(request);

  if (!suppliedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: "Unauthorized." }, 401);
  }

  let env;

  try {
    env = getEmailEnvironment();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Notification setup is incomplete." }, 500);
  }

  const payload = (await request.json().catch(() => ({}))) as ReminderRunRequest;
  const limit = typeof payload.limit === "number" ? payload.limit : 25;
  const feedbackLimit = typeof payload.feedbackLimit === "number" ? payload.feedbackLimit : limit;
  const feedbackLookbackHours =
    typeof payload.feedbackLookbackHours === "number" ? payload.feedbackLookbackHours : 24 * 7;

  const admin = createAdminClient(env);
  const unnotifiedFeedbackResponses = await loadUnnotifiedNewFeedbackResponses(
    admin,
    feedbackLimit,
    feedbackLookbackHours,
  );
  const dueReminders = await loadDueReminderSequences(admin, limit);
  const feedbackTemplateMap =
    unnotifiedFeedbackResponses.length > 0
      ? await loadEmailTemplates(admin, [newFeedbackTemplateKey])
      : new Map();
  const templateMap =
    dueReminders.length > 0
      ? await loadEmailTemplates(admin, [...reminderTemplateKeys])
      : new Map();

  const errors: string[] = [];
  let feedbackSent = 0;
  let feedbackSkipped = 0;
  let sent = 0;
  let resolved = 0;
  let cancelled = 0;

  for (const response of unnotifiedFeedbackResponses) {
    try {
      const result = await processNewFeedbackNotificationForResponse(
        admin,
        env,
        response,
        feedbackTemplateMap,
      );

      if (result.outcome === "sent") {
        feedbackSent += 1;
      } else {
        feedbackSkipped += 1;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to process a feedback notification.");
    }
  }

  for (const reminder of dueReminders) {
    try {
      const result = await processReminderSequence(admin, env, reminder, templateMap);

      if (result.outcome === "sent") {
        sent += 1;
      } else if (result.outcome === "resolved") {
        resolved += 1;
      } else if (result.outcome === "cancelled") {
        cancelled += 1;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to process a reminder sequence.");
    }
  }

  return json({
    ok: errors.length === 0,
    processed: dueReminders.length + unnotifiedFeedbackResponses.length,
    feedbackProcessed: unnotifiedFeedbackResponses.length,
    feedbackSent,
    feedbackSkipped,
    remindersProcessed: dueReminders.length,
    sent,
    resolved,
    cancelled,
    errors,
  });
});
