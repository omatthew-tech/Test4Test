import type { SupabaseClient } from "npm:@supabase/supabase-js@2.100.1";
import type { EmailEnvironment } from "./email-system.ts";

export interface EmailDestination {
  destination: "feedback" | "test";
  resource_id: string;
  entry: "feedback_email" | "test_back_email" | "other_email";
  feedback_source?: "earn" | null;
}

export function emailDestinationPath(link: EmailDestination) {
  const query = new URLSearchParams();
  if (link.destination === "feedback") query.set("response", link.resource_id);
  query.set("earn_entry", link.entry);
  if (link.feedback_source) query.set("feedback_source", link.feedback_source);
  const path = link.destination === "feedback" ? "/recordings" : `/test/${link.resource_id}`;
  return `${path}?${query}`;
}

export async function hashEmailAccessValue(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createEmailDestinationLink(
  admin: SupabaseClient,
  env: EmailEnvironment,
  recipient: { id: string; email: string },
  destination: EmailDestination,
) {
  // Senders are deployed with issuance off until the endpoint and frontend are verified.
  if (!env.emailAccessLinksEnabled) return `${env.appBaseUrl}${emailDestinationPath(destination)}`;
  if (!env.smtp2goAuthLinkApiKey || !env.smtp2goAuthLinkTrackingDisabled) {
    throw new Error(
      "Email sign-in delivery requires a dedicated SMTP2GO key with tracking disabled.",
    );
  }
  const base = new URL(env.appBaseUrl);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Email sign-in delivery requires an HTTPS application origin.");
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const { error } = await admin.rpc("issue_email_access_link", {
    p_token_hash: await hashEmailAccessValue(token),
    p_user_id: recipient.id,
    p_email: recipient.email,
    p_destination: destination.destination,
    p_resource_id: destination.resource_id,
    p_entry: destination.entry,
    p_feedback_source: destination.feedback_source ?? null,
  });
  if (error) throw new Error("Unable to issue email sign-in link.");
  return `${base.origin}/email-access#token=${token}`;
}
