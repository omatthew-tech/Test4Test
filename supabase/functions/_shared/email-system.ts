import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface EmailEnvironment {
  supabaseUrl: string;
  serviceRoleKey: string;
  smtp2goApiKey: string;
  smtp2goSender: string;
  appBaseUrl: string;
}

export interface EmailTemplateRecord {
  key: string;
  subject_template: string;
  text_template: string;
  html_template: string;
}

export interface RenderedEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reminder-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTemplate(template: string, variables: Record<string, string>, escapeValues: boolean) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey);
    const value = variables[key] ?? "";
    return escapeValues ? escapeHtml(value) : value;
  });
}

export function renderEmailTemplate(
  template: EmailTemplateRecord,
  variables: Record<string, string>,
): RenderedEmail {
  return {
    subject: renderTemplate(template.subject_template, variables, false),
    textBody: renderTemplate(template.text_template, variables, false),
    htmlBody: renderTemplate(template.html_template, variables, true),
  };
}

export function getEmailEnvironment(): EmailEnvironment {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    "";
  const smtp2goApiKey = Deno.env.get("SMTP2GO_API_KEY")?.trim() ?? "";
  const smtp2goSender = Deno.env.get("SMTP2GO_SENDER")?.trim() ?? "";
  const appBaseUrl = (Deno.env.get("APP_BASE_URL")?.trim() || "https://test4test.io").replace(/\/+$/, "");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server secrets for notifications.");
  }

  if (!smtp2goApiKey || !smtp2goSender) {
    throw new Error("Missing SMTP2GO secrets for notifications.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    smtp2goApiKey,
    smtp2goSender,
    appBaseUrl,
  };
}

export function createAdminClient(env: EmailEnvironment) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function loadEmailTemplates(
  admin: SupabaseClient,
  keys: string[],
) {
  const uniqueKeys = [...new Set(keys.filter((key) => key.trim()))];

  if (uniqueKeys.length === 0) {
    return new Map<string, EmailTemplateRecord>();
  }

  const { data, error } = await admin
    .from("email_templates")
    .select("key, subject_template, text_template, html_template")
    .in("key", uniqueKeys);

  if (error) {
    throw new Error(error.message);
  }

  const templates = new Map(
    ((data ?? []) as EmailTemplateRecord[]).map((template) => [template.key, template]),
  );

  for (const key of uniqueKeys) {
    if (!templates.has(key)) {
      throw new Error(`Missing email template: ${key}`);
    }
  }

  return templates;
}

export async function sendEmail(
  env: EmailEnvironment,
  {
    to,
    subject,
    textBody,
    htmlBody,
  }: {
    to: string;
    subject: string;
    textBody: string;
    htmlBody: string;
  },
) {
  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Smtp2go-Api-Key": env.smtp2goApiKey,
    },
    body: JSON.stringify({
      sender: `Test4Test <${env.smtp2goSender}>`,
      to: [to],
      subject,
      text_body: textBody,
      html_body: htmlBody,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.data?.error || payload?.error || "SMTP2GO request failed.";
    throw new Error(message);
  }

  if ((payload?.data?.succeeded ?? 0) < 1) {
    const failureMessage = Array.isArray(payload?.data?.failures)
      ? payload.data.failures.join("; ")
      : "SMTP2GO did not confirm a successful send.";
    throw new Error(failureMessage);
  }

  const providerMessageId =
    payload?.data?.email_id ?? payload?.data?.email_ids?.[0] ?? payload?.data?.request_id ?? null;

  return {
    providerMessageId,
    payload,
  };
}

export async function logEmailDelivery(
  admin: SupabaseClient,
  {
    templateKey,
    recipientUserId,
    recipientEmail,
    relatedResponseId,
    relatedSubmissionId,
    reminderSequenceId,
    subject,
    status,
    providerMessageId,
    errorMessage,
    metadata,
  }: {
    templateKey: string;
    recipientUserId?: string | null;
    recipientEmail: string;
    relatedResponseId?: string | null;
    relatedSubmissionId?: string | null;
    reminderSequenceId?: string | null;
    subject: string;
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("email_delivery_logs").insert({
    template_key: templateKey,
    recipient_user_id: recipientUserId ?? null,
    recipient_email: recipientEmail,
    related_response_id: relatedResponseId ?? null,
    related_submission_id: relatedSubmissionId ?? null,
    reminder_sequence_id: reminderSequenceId ?? null,
    subject,
    status,
    provider_message_id: providerMessageId ?? null,
    error_message: errorMessage ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
}
