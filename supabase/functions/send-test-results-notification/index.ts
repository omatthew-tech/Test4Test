import {
  corsHeaders,
  createAdminClient,
  getEmailEnvironment,
  json,
} from "../_shared/email-system.ts";
import {
  processNewFeedbackNotificationForResponse,
  type NewFeedbackResponseRow,
} from "../_shared/new-feedback-notifications.ts";

interface NotificationRequest {
  responseId?: string;
}

interface ResponseRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  owner_notified_at: string | null;
  status: string;
  credit_awarded: boolean;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let env;

  try {
    env = getEmailEnvironment();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Notification setup is incomplete." }, 500);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return json({ error: "Unauthorized." }, 401);
  }

  const admin = createAdminClient(env);
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ error: userError?.message ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as NotificationRequest;
  const responseId = payload.responseId?.trim() ?? "";

  if (!responseId) {
    return json({ error: "Missing response id." }, 400);
  }

  const { data: responseRow, error: responseError } = await admin
    .from("test_responses")
    .select("id, submission_id, tester_user_id, owner_notified_at, status, credit_awarded")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return json({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  const responseRecord = responseRow as ResponseRow;

  if (responseRecord.tester_user_id !== user.id) {
    return json({ error: "You do not have permission to send this notification." }, 403);
  }

  if (responseRecord.owner_notified_at) {
    return json({ ok: true, skipped: true, message: "Notification already sent." });
  }

  if (responseRecord.status !== "approved" || responseRecord.credit_awarded !== true) {
    return json({ ok: true, skipped: true, message: "Notification will send after the response is approved." });
  }

  try {
    await processNewFeedbackNotificationForResponse(
      admin,
      env,
      responseRecord as NewFeedbackResponseRow,
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to send feedback notification." },
      502,
    );
  }

  return json({ ok: true, message: "Notification sent." });
});
