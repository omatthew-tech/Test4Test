import {
  corsHeaders,
  createAdminClient,
  getEmailEnvironment,
  json,
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
} from "../_shared/email-system.ts";

const templateKey = "tip_payment_method_request";

interface TipPaymentMethodRequest {
  responseId?: string;
}

interface ResponseRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  anonymous_label: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  paypal_handle?: string | null;
  venmo_handle?: string | null;
  cash_app_handle?: string | null;
}

interface SentDeliveryRow {
  created_at: string;
}

function hasPaymentMethod(profile: ProfileRow) {
  return Boolean(
    profile.paypal_handle?.trim() ||
      profile.venmo_handle?.trim() ||
      profile.cash_app_handle?.trim(),
  );
}

async function getAuthenticatedUserId(admin: ReturnType<typeof createAdminClient>, request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return { userId: null, error: "Unauthorized." };
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user) {
    return { userId: null, error: error?.message ?? "Unauthorized." };
  }

  return { userId: user.id, error: null };
}

async function loadSentDelivery(admin: ReturnType<typeof createAdminClient>, responseId: string) {
  const { data, error } = await admin
    .from("email_delivery_logs")
    .select("created_at")
    .eq("related_response_id", responseId)
    .eq("template_key", templateKey)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SentDeliveryRow | null) ?? null;
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
    return json({ error: error instanceof Error ? error.message : "Tip email setup is incomplete." }, 500);
  }

  const admin = createAdminClient(env);
  const auth = await getAuthenticatedUserId(admin, request);

  if (!auth.userId) {
    return json({ error: auth.error ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as TipPaymentMethodRequest;
  const responseId = payload.responseId?.trim() ?? "";

  if (!responseId) {
    return json({ error: "Missing response id." }, 400);
  }

  const { data: responseRow, error: responseError } = await admin
    .from("test_responses")
    .select("id, submission_id, tester_user_id, anonymous_label")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return json({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  const responseRecord = responseRow as ResponseRow;
  const { data: submissionRow, error: submissionError } = await admin
    .from("submissions")
    .select("id, user_id, product_name")
    .eq("id", responseRecord.submission_id)
    .single();

  if (submissionError || !submissionRow) {
    return json({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const submission = submissionRow as SubmissionRow;

  if (submission.user_id !== auth.userId) {
    return json({ error: "You do not have permission to tip this tester." }, 403);
  }

  const { data: testerRow, error: testerError } = await admin
    .from("profiles")
    .select("id, email, display_name, paypal_handle, venmo_handle, cash_app_handle")
    .eq("id", responseRecord.tester_user_id)
    .single();

  if (testerError || !testerRow) {
    return json({ error: testerError?.message ?? "Tester profile not found." }, 404);
  }

  const tester = testerRow as ProfileRow;

  if (hasPaymentMethod(tester)) {
    return json({
      ok: true,
      skipped: true,
      reason: "has_payment_method",
      message: "This tester already has a payment method on file.",
    });
  }

  try {
    const sentDelivery = await loadSentDelivery(admin, responseRecord.id);

    if (sentDelivery) {
      return json({
        ok: true,
        skipped: true,
        reason: "already_sent",
        message: "We already emailed this tester about adding a payment method.",
      });
    }

    const templates = await loadEmailTemplates(admin, [templateKey]);
    const template = templates.get(templateKey);

    if (!template) {
      throw new Error(`Missing email template: ${templateKey}`);
    }

    const profileUrl = `${env.appBaseUrl}/profile`;
    const rendered = renderEmailTemplate(template, {
      appName: submission.product_name,
      profileUrl,
    });

    const sendResult = await sendEmail(env, {
      to: tester.email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: tester.id,
      recipientEmail: tester.email,
      relatedResponseId: responseRecord.id,
      relatedSubmissionId: submission.id,
      subject: rendered.subject,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      metadata: {
        founderUserId: auth.userId,
        anonymousLabel: responseRecord.anonymous_label,
      },
    });

    return json({
      ok: true,
      message: "We emailed this tester a link to add a payment method.",
    });
  } catch (error) {
    const subject = "A founder wants to send you a tip";

    await logEmailDelivery(admin, {
      templateKey,
      recipientUserId: tester.id,
      recipientEmail: tester.email,
      relatedResponseId: responseRecord.id,
      relatedSubmissionId: submission.id,
      subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to send tip payment method request.",
      metadata: {
        founderUserId: auth.userId,
        anonymousLabel: responseRecord.anonymous_label,
      },
    }).catch(() => undefined);

    return json(
      { error: error instanceof Error ? error.message : "Failed to send tip payment method request." },
      502,
    );
  }
});
