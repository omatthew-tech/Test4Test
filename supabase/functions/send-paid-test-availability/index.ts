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

interface NotificationQueueRow {
  id: string;
  submission_id: string;
  tester_user_id: string;
  attempt_count: number;
}
interface NotificationDeliveryContext {
  sendable: boolean;
  reason?: string;
  firstName?: string;
  email?: string;
  productName?: string;
}

const workerCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-paid-test-secret",
};

function workerJson(body: unknown, status = 200) {
  const response = json(body, status);
  Object.entries(workerCorsHeaders).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sendWithRetry(
  send: () => Promise<{ providerMessageId: string | null }>,
  retries = 2,
  waitFor: (milliseconds: number) => Promise<unknown> = wait,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await waitFor(250 * 3 ** attempt);
    }
  }

  throw lastError;
}

export async function handlePaidTestAvailabilityRequest(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: workerCorsHeaders });
  }

  if (request.method !== "POST") {
    return workerJson({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("PAID_TEST_NOTIFICATION_SECRET")?.trim() ?? "";
  const suppliedSecret = request.headers.get("x-paid-test-secret")?.trim() ?? "";

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return workerJson({ error: "Unauthorized." }, 401);
  }

  let env;
  try {
    env = getEmailEnvironment();
  } catch (error) {
    return workerJson(
      { error: error instanceof Error ? error.message : "Notification setup is incomplete." },
      500,
    );
  }

  const admin = createAdminClient(env);
  const payload = (await request.json().catch(() => ({}))) as { limit?: number };
  const requestedLimit = Number.isFinite(payload.limit) ? Math.trunc(payload.limit ?? 25) : 25;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);
  const { data: claimedRows, error: claimError } = await admin.rpc(
    "claim_paid_test_notifications",
    { p_limit: limit },
  );

  if (claimError) return workerJson({ error: claimError.message }, 500);

  const jobs = (claimedRows ?? []) as NotificationQueueRow[];
  if (jobs.length === 0) {
    return workerJson({ ok: true, processed: 0, sent: 0, failed: 0, cancelled: 0 });
  }

  let template;
  try {
    template = (await loadEmailTemplates(admin, ["paid_test_available"])).get(
      "paid_test_available",
    );
  } catch (error) {
    return workerJson(
      { error: error instanceof Error ? error.message : "Email template could not be loaded." },
      500,
    );
  }

  if (!template) return workerJson({ error: "Paid-test email template is missing." }, 500);

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of jobs) {
    const { data: contextData, error: contextError } = await admin.rpc(
      "get_paid_test_notification_delivery",
      { p_queue_id: job.id },
    );

    if (contextError) {
      const retryDelayMinutes = Math.min(5 * 2 ** Math.max(job.attempt_count - 1, 0), 240);
      await admin
        .from("paid_test_notification_queue")
        .update({
          status: "failed",
          last_error: contextError.message,
          next_attempt_at: new Date(Date.now() + retryDelayMinutes * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
      continue;
    }

    const deliveryContext = (contextData ?? {}) as NotificationDeliveryContext;
    const firstName = deliveryContext.firstName;
    const recipientEmail = deliveryContext.email;
    const productName = deliveryContext.productName;
    if (
      deliveryContext.sendable !== true ||
      typeof firstName !== "string" ||
      typeof recipientEmail !== "string" ||
      typeof productName !== "string"
    ) {
      await admin
        .from("paid_test_notification_queue")
        .update({
          status: "cancelled",
          last_error:
            deliveryContext.reason ?? "Notification no longer matches an eligible opted-in tester.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      cancelled += 1;
      continue;
    }

    const rendered = renderEmailTemplate(template, {
      firstName,
      productName,
      earnUrl: `${env.appBaseUrl}/earn`,
    });

    try {
      const delivery = await sendWithRetry(() =>
        sendEmail(env, {
          to: recipientEmail,
          subject: rendered.subject,
          textBody: rendered.textBody,
          htmlBody: rendered.htmlBody,
        }),
      );

      await logEmailDelivery(admin, {
        templateKey: "paid_test_available",
        recipientUserId: job.tester_user_id,
        recipientEmail,
        relatedSubmissionId: job.submission_id,
        subject: rendered.subject,
        status: "sent",
        providerMessageId: delivery.providerMessageId,
        metadata: { queueId: job.id, attemptCount: job.attempt_count },
      });

      await admin
        .from("paid_test_notification_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: delivery.providerMessageId,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paid-test email failed.";
      const finalFailure = job.attempt_count >= 5;
      const retryDelayMinutes = Math.min(5 * 2 ** Math.max(job.attempt_count - 1, 0), 240);

      try {
        await logEmailDelivery(admin, {
          templateKey: "paid_test_available",
          recipientUserId: job.tester_user_id,
          recipientEmail,
          relatedSubmissionId: job.submission_id,
          subject: rendered.subject,
          status: "failed",
          errorMessage: message,
          metadata: { queueId: job.id, attemptCount: job.attempt_count },
        });
      } catch {
        // The queue remains authoritative if delivery logging is temporarily unavailable.
      }

      await admin
        .from("paid_test_notification_queue")
        .update({
          status: "failed",
          last_error: message,
          next_attempt_at: new Date(
            Date.now() + (finalFailure ? 240 : retryDelayMinutes) * 60_000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
    }
  }

  return workerJson({ ok: failed === 0, processed: jobs.length, sent, failed, cancelled });
}

if (import.meta.main) {
  Deno.serve(handlePaidTestAvailabilityRequest);
}
