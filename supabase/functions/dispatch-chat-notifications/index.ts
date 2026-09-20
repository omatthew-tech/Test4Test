import {
  createAdminClient,
  getEmailEnvironment,
  json,
  logEmailDelivery,
  sendEmail,
} from "../_shared/email-system.ts";
import { renderChatEmail, type ChatEmailContext } from "../_shared/chat-email.ts";

interface Job {
  id: string;
  lease_id: string;
  recipient_user_id: string;
  attempt_count: number;
}
interface Delivery extends ChatEmailContext {
  email: string;
  submissionId: string;
}

export async function dispatchChatNotifications(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const secret = Deno.env.get("CHAT_DISPATCH_SECRET")?.trim();
  if (!secret || request.headers.get("x-chat-dispatch-secret") !== secret) {
    return json({ error: "Unauthorized." }, 401);
  }
  const env = getEmailEnvironment();
  const admin = createAdminClient(env);
  // Small batches keep all provider calls inside the five-minute lease.
  const { data, error } = await admin.rpc("claim_chat_notifications", { p_limit: 10 });
  if (error) return json({ error: "Unable to claim notifications." }, 503);
  let sent = 0;
  let failed = 0;
  let cancelled = 0;
  for (const job of (data ?? []) as Job[]) {
    let rendered: ReturnType<typeof renderChatEmail> | undefined;
    let context: Delivery | null = null;
    let providerId: string | null = null;
    let delivered = false;
    try {
      const result = await admin.rpc("chat_notification_context", {
        p_id: job.id,
        p_lease: job.lease_id,
      });
      if (result.error) throw new Error("Delivery context unavailable.");
      context = result.data as Delivery | null;
      if (!context) {
        cancelled += 1;
        continue;
      }
      rendered = renderChatEmail(context, env.appBaseUrl);
      const delivery = await sendEmail(env, {
        to: context.email,
        ...rendered,
        timeoutMs: 15_000,
      });
      providerId = delivery.providerMessageId;
      delivered = true;
      // Commit provider success BEFORE best-effort logging. A log failure cannot resend email.
      const completed = await admin.rpc("finish_chat_notification", {
        p_id: job.id,
        p_lease: job.lease_id,
        p_provider_id: providerId,
        p_error: null,
      });
      if (completed.error) throw new Error("Unable to persist provider confirmation.");
      sent += 1;
    } catch {
      failed += 1;
      // Do not immediately retry provider sends. Queue leases/backoff control retries.
      // Never include message text, addresses, or upstream response bodies in errors.
      if (!delivered) {
        await admin.rpc("finish_chat_notification", {
          p_id: job.id,
          p_lease: job.lease_id,
          p_provider_id: null,
          p_error: "Chat notification delivery failed.",
        });
      }
    }
    if (context && rendered) {
      try {
        await logEmailDelivery(admin, {
          templateKey: "chat_message",
          recipientUserId: job.recipient_user_id,
          recipientEmail: context.email,
          relatedSubmissionId: context.submissionId,
          subject: rendered.subject,
          status: delivered ? "sent" : "failed",
          providerMessageId: providerId,
          metadata: { queueId: job.id, stage: context.stage, attemptCount: job.attempt_count },
          errorMessage: delivered ? null : "Chat notification delivery failed.",
        });
      } catch {
        /* The durable queue is authoritative; logging never triggers a resend. */
      }
    }
  }
  return json({ ok: failed === 0, sent, failed, cancelled });
}

if (import.meta.main) {
  Deno.serve(async (request) => {
    try {
      return await dispatchChatNotifications(request);
    } catch {
      return json({ error: "Chat notification worker unavailable." }, 503);
    }
  });
}
