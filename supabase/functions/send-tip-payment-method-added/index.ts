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

const requestTemplateKey = "tip_payment_method_request";
const addedTemplateKey = "tip_payment_method_added";

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  paypal_handle?: string | null;
  venmo_handle?: string | null;
  cash_app_handle?: string | null;
}

interface TipRequestLogRow {
  id: string;
  related_response_id: string | null;
  related_submission_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  product_name: string;
}

function hasPaymentMethod(profile: ProfileRow) {
  return Boolean(
    profile.paypal_handle?.trim() ||
    profile.venmo_handle?.trim() ||
    profile.cash_app_handle?.trim(),
  );
}

function getFounderUserId(metadata: Record<string, unknown> | null) {
  const value = metadata?.founderUserId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getAuthenticatedUserId(
  admin: ReturnType<typeof createAdminClient>,
  request: Request,
) {
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

async function loadProfile(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, paypal_handle, venmo_handle, cash_app_handle")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Profile not found.");
  }

  return data as ProfileRow;
}

async function loadSubmission(admin: ReturnType<typeof createAdminClient>, submissionId: string) {
  const { data, error } = await admin
    .from("submissions")
    .select("id, user_id, product_name")
    .eq("id", submissionId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Submission not found.");
  }

  return data as SubmissionRow;
}

async function hasSentAddedNotification(
  admin: ReturnType<typeof createAdminClient>,
  responseId: string,
  founderUserId: string,
) {
  const { data, error } = await admin
    .from("email_delivery_logs")
    .select("id")
    .eq("template_key", addedTemplateKey)
    .eq("related_response_id", responseId)
    .eq("recipient_user_id", founderUserId)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function loadTipRequestLogs(
  admin: ReturnType<typeof createAdminClient>,
  testerUserId: string,
) {
  const { data, error } = await admin
    .from("email_delivery_logs")
    .select("id, related_response_id, related_submission_id, metadata, created_at")
    .eq("template_key", requestTemplateKey)
    .eq("recipient_user_id", testerUserId)
    .eq("status", "sent")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TipRequestLogRow[];
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
    return json(
      { error: error instanceof Error ? error.message : "Tip email setup is incomplete." },
      500,
    );
  }

  const admin = createAdminClient(env);
  const auth = await getAuthenticatedUserId(admin, request);

  if (!auth.userId) {
    return json({ error: auth.error ?? "Unauthorized." }, 401);
  }

  let tester: ProfileRow;

  try {
    tester = await loadProfile(admin, auth.userId);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Tester profile not found." },
      404,
    );
  }

  if (!hasPaymentMethod(tester)) {
    return json({
      ok: true,
      skipped: true,
      reason: "no_payment_method",
      notifiedCount: 0,
      message: "No payment methods are ready yet.",
    });
  }

  try {
    const [templates, requestLogs] = await Promise.all([
      loadEmailTemplates(admin, [addedTemplateKey]),
      loadTipRequestLogs(admin, tester.id),
    ]);
    const template = templates.get(addedTemplateKey);

    if (!template) {
      throw new Error(`Missing email template: ${addedTemplateKey}`);
    }

    const seenResponseIds = new Set<string>();
    let notifiedCount = 0;

    for (const requestLog of requestLogs) {
      const responseId = requestLog.related_response_id;
      const submissionId = requestLog.related_submission_id;
      const founderUserId = getFounderUserId(requestLog.metadata);

      if (!responseId || !submissionId || !founderUserId || seenResponseIds.has(responseId)) {
        continue;
      }

      seenResponseIds.add(responseId);

      if (await hasSentAddedNotification(admin, responseId, founderUserId)) {
        continue;
      }

      const [submission, founder] = await Promise.all([
        loadSubmission(admin, submissionId),
        loadProfile(admin, founderUserId),
      ]);

      if (submission.user_id !== founder.id) {
        continue;
      }

      const reviewUrl = `${env.appBaseUrl}/analytics`;
      const rendered = renderEmailTemplate(template, {
        reviewUrl,
      });

      try {
        const sendResult = await sendEmail(env, {
          to: founder.email,
          subject: rendered.subject,
          textBody: rendered.textBody,
          htmlBody: rendered.htmlBody,
        });

        await logEmailDelivery(admin, {
          templateKey: addedTemplateKey,
          recipientUserId: founder.id,
          recipientEmail: founder.email,
          relatedResponseId: responseId,
          relatedSubmissionId: submission.id,
          subject: rendered.subject,
          status: "sent",
          providerMessageId: sendResult.providerMessageId,
          metadata: {
            testerUserId: tester.id,
            requestLogId: requestLog.id,
          },
        });

        notifiedCount += 1;
      } catch (error) {
        await logEmailDelivery(admin, {
          templateKey: addedTemplateKey,
          recipientUserId: founder.id,
          recipientEmail: founder.email,
          relatedResponseId: responseId,
          relatedSubmissionId: submission.id,
          subject: rendered.subject,
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to send payment method added notification.",
          metadata: {
            testerUserId: tester.id,
            requestLogId: requestLog.id,
          },
        }).catch(() => undefined);
      }
    }

    return json({
      ok: true,
      notifiedCount,
      message:
        notifiedCount > 0
          ? `Notified ${notifiedCount} founder${notifiedCount === 1 ? "" : "s"}.`
          : "No pending tip notifications needed to be sent.",
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to send tip notifications." },
      502,
    );
  }
});
