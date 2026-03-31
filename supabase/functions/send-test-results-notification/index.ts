import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotificationRequest {
  responseId?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";
  const smtp2goApiKey = Deno.env.get("SMTP2GO_API_KEY")?.trim() ?? "";
  const smtp2goSender = Deno.env.get("SMTP2GO_SENDER")?.trim() ?? "";
  const appBaseUrl = (Deno.env.get("APP_BASE_URL")?.trim() || "https://test4test.io").replace(/\/+$/, "");
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !secretKey) {
    return json({ error: "Missing Supabase server secrets for notifications." }, 500);
  }

  if (!smtp2goApiKey || !smtp2goSender) {
    return json({ error: "Missing SMTP2GO secrets for notifications." }, 500);
  }

  if (!accessToken) {
    return json({ error: "Unauthorized." }, 401);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

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
    .select("id, submission_id, tester_user_id, owner_notified_at")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return json({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  if (responseRow.tester_user_id !== user.id) {
    return json({ error: "You do not have permission to send this notification." }, 403);
  }

  if (responseRow.owner_notified_at) {
    return json({ ok: true, skipped: true, message: "Notification already sent." });
  }

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select("id, product_name, user_id")
    .eq("id", responseRow.submission_id)
    .single();

  if (submissionError || !submission) {
    return json({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("email, display_name")
    .eq("id", submission.user_id)
    .single();

  if (ownerError || !owner) {
    return json({ error: ownerError?.message ?? "Submission owner not found." }, 404);
  }

  const resultsUrl = `${appBaseUrl}/my-tests/${submission.id}`;
  const safeProductName = escapeHtml(submission.product_name);
  const safeResultsUrl = escapeHtml(resultsUrl);

  const subject = `New feedback for ${submission.product_name}`;
  const textBody = [
    `Someone just tested ${submission.product_name}.`,
    "",
    "Your feedback is ready to view.",
    "",
    `View Feedback: ${resultsUrl}`,
    "",
    `Or open this link directly: ${resultsUrl}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p>Someone just tested <strong>${safeProductName}</strong>.</p>
      <p>Your feedback is ready to view.</p>
      <p>
        <a href="${safeResultsUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
          View Feedback
        </a>
      </p>
      <p style="margin-top: 18px; color: #6f655d;">Or open this link directly: <a href="${safeResultsUrl}" style="color: #a34f25;">${safeResultsUrl}</a></p>
    </div>
  `;

  const smtpResponse = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Smtp2go-Api-Key": smtp2goApiKey,
    },
    body: JSON.stringify({
      sender: `Test4Test <${smtp2goSender}>`,
      to: [owner.email],
      subject,
      text_body: textBody,
      html_body: htmlBody,
    }),
  });

  const smtpPayload = await smtpResponse.json().catch(() => null);

  if (!smtpResponse.ok) {
    const message = smtpPayload?.data?.error || smtpPayload?.error || "SMTP2GO request failed.";
    return json({ error: message }, smtpResponse.status);
  }

  if ((smtpPayload?.data?.succeeded ?? 0) < 1) {
    const failureMessage = Array.isArray(smtpPayload?.data?.failures)
      ? smtpPayload.data.failures.join("; ")
      : "SMTP2GO did not confirm a successful send.";
    return json({ error: failureMessage }, 502);
  }

  const { error: updateError } = await admin
    .from("test_responses")
    .update({ owner_notified_at: new Date().toISOString() })
    .eq("id", responseRow.id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({ ok: true, message: "Notification sent." });
});




