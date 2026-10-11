import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  EmailDeliveryError,
  type EmailEnvironment,
  json,
  loadEmailTemplates,
  logEmailDelivery,
  renderEmailTemplate,
  sendEmail,
} from "./email-system.ts";

export const followupTemplateKey = "new_user_inactivity_followup";
export const followupSender = { name: "Matt @ Test4Test", email: "Matt@Test4Test.io" };
type Job = { user_id: string; lease_id: string };
type Context = { email: string; submissionId: string | null };

async function senderReadiness(env: EmailEnvironment) {
  // Read-only provider lookup; never send a customer email to verify configuration.
  const response = await fetch("https://api.smtp2go.com/v3/domain/view", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Smtp2go-Api-Key": env.smtp2goApiKey },
    body: JSON.stringify({ domain: "test4test.io" }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  const domains = payload?.data?.domains;
  return (
    response.ok &&
    Array.isArray(domains) &&
    domains.some(
      (entry: {
        domain?: {
          fulldomain?: string;
          dkim_verified?: boolean;
          rpath_verified?: boolean;
        };
      }) =>
        entry.domain?.fulldomain?.toLowerCase() === "test4test.io" &&
        entry.domain.dkim_verified === true &&
        entry.domain.rpath_verified === true,
    )
  );
}

export async function runNewUserFollowups(
  request: Request,
  dependencies: { secret: string; connect: () => { admin: SupabaseClient; env: EmailEnvironment } },
) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supplied = request.headers.get("x-reminder-secret") ?? "";
  if (!dependencies.secret || !supplied) return json({ error: "Unauthorized" }, 401);
  const hashes = await Promise.all(
    [supplied, dependencies.secret].map((value) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
  const a = new Uint8Array(hashes[0]);
  const b = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) return json({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body.dryRun !== undefined && typeof body.dryRun !== "boolean")
  )
    return json({ error: "Invalid request" }, 400);

  try {
    const { admin, env } = dependencies.connect();
    const rpc = async (action: string, job?: Job, outcome?: string, providerId?: string | null) => {
      const { data, error } = await admin.rpc("new_user_followup_worker", {
        p_action: action,
        p_user_id: job?.user_id ?? null,
        p_lease_id: job?.lease_id ?? null,
        p_outcome: outcome ?? null,
        p_provider_id: providerId ?? null,
      });
      if (error) throw new Error("Follow-up database request failed");
      return data;
    };
    const templates = await loadEmailTemplates(admin, [followupTemplateKey]);
    const rendered = renderEmailTemplate(templates.get(followupTemplateKey)!, {});
    if (body.dryRun === true) {
      const readiness = await rpc("inspect");
      const senderVerified = await senderReadiness(env).catch(() => false);
      return json({
        ok: true,
        dryRun: true,
        ...readiness,
        senderVerified,
        sender: followupSender,
        replyTo: followupSender.email,
        ...rendered,
      });
    }
    const jobs = (await rpc("claim")) as Job[];
    let sent = 0;
    let cancelled = 0;
    let failed = 0;
    for (const job of jobs) {
      let context: Context | null = null;
      let providerId: string | null = null;
      let accepted = false;
      let began = false;
      try {
        // This transition rechecks activity and commits "sending" before SMTP.
        // If its HTTP response is lost, the lease is quarantined, never resent.
        context = (await rpc("begin", job)) as Context | null;
        if (!context) {
          cancelled++;
          continue;
        }
        began = true;
        const delivery = await sendEmail(env, {
          to: context.email,
          ...rendered,
          sender: followupSender,
          replyTo: followupSender.email,
          timeoutMs: 10_000,
        });
        accepted = true;
        providerId = delivery.providerMessageId;
        const complete = await rpc("finish", job, "sent", providerId);
        if (complete !== true) throw new Error("Unable to record provider acceptance");
        sent++;
      } catch (error) {
        failed++;
        // Only a confirmed rejection permits another SMTP attempt. A successful
        // send with a failed DB acknowledgement stays sending/review for inspection.
        if (!accepted && began) {
          const outcome =
            error instanceof EmailDeliveryError && error.outcome === "rejected"
              ? "rejected"
              : "unknown";
          await rpc("finish", job, outcome).catch(() => undefined);
        }
      }
      if (context) {
        await logEmailDelivery(admin, {
          templateKey: followupTemplateKey,
          recipientUserId: job.user_id,
          recipientEmail: context.email,
          relatedSubmissionId: context.submissionId,
          subject: rendered.subject,
          status: accepted ? "sent" : "failed",
          providerMessageId: providerId,
          metadata: { leaseId: job.lease_id },
          errorMessage: accepted ? null : "Follow-up delivery failed; inspect queue state",
        }).catch(() => undefined);
      }
    }
    return json({ ok: failed === 0, sent, cancelled, failed }, failed ? 502 : 200);
  } catch {
    return json({ error: "Follow-up worker unavailable" }, 503);
  }
}
