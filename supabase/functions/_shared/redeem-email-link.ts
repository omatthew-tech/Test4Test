import type { SupabaseClient } from "npm:@supabase/supabase-js@2.100.1";
import {
  emailDestinationPath,
  hashEmailAccessValue,
  type EmailDestination,
} from "./email-access-links.ts";

interface StoredLink extends EmailDestination {
  id: string;
  user_id: string;
  email: string;
}

interface Dependencies {
  admin: SupabaseClient;
  verifier: SupabaseClient;
  allowedOrigins: string[];
}

// Never log request bodies, bearer credentials, generated links, sessions, or provider errors.
export async function redeemEmailLink(request: Request, dependencies: Dependencies) {
  const { admin, verifier, allowedOrigins } = dependencies;
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  const reply = (status: number, code: string, data = {}) =>
    new Response(JSON.stringify({ code, ...data }), { status, headers });
  if (!allowedOrigins.includes(origin)) return reply(403, "origin_denied");
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, "method_not_allowed");
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return reply(400, "invalid_link");

  let claim: { userId: string; id: string; exchangeFinished: boolean } | undefined;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const rate = await admin.rpc("check_email_access_rate_limit", {
      p_key_hash: await hashEmailAccessValue(`ip:${ip}`),
      p_limit: 60,
    });
    if (rate.error) return reply(503, "temporarily_unavailable");
    if (!rate.data) {
      headers["Retry-After"] = "60";
      return reply(429, "rate_limited");
    }
    // Bound the body even when Content-Length is missing or dishonest.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "invalid_link");
    let body = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return reply(400, "invalid_link");
      }
      body += decoder.decode(value, { stream: true });
    }
    let input: { token?: unknown };
    try {
      input = JSON.parse(body);
    } catch {
      return reply(400, "invalid_link");
    }
    if (
      !input ||
      Object.keys(input).some((key) => key !== "token") ||
      typeof input.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.token)
    )
      return reply(400, "invalid_link");
    const tokenHash = await hashEmailAccessValue(input.token);
    const resolve = () => admin.rpc("resolve_email_access_link", { p_token_hash: tokenHash });
    const found = await resolve();
    if (found.error) return reply(503, "temporarily_unavailable");
    const link = found.data as StoredLink | null;
    if (!link) return reply(401, "invalid_link");
    const accountRate = await admin.rpc("check_email_access_rate_limit", {
      p_key_hash: await hashEmailAccessValue(`account:${link.user_id}`),
      p_limit: 30,
    });
    if (accountRate.error) return reply(503, "temporarily_unavailable");
    if (!accountRate.data) {
      headers["Retry-After"] = "60";
      return reply(429, "rate_limited");
    }
    const destination = emailDestinationPath(link);
    const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (bearer) {
      const current = await admin.auth.getUser(bearer);
      if (!current.error && current.data.user.id === link.user_id) {
        const valid = await resolve();
        if (valid.error) return reply(503, "temporarily_unavailable");
        if (!valid.data) return reply(401, "invalid_link");
        return reply(200, "authenticated", {
          reuseSession: true,
          userId: link.user_id,
          destination,
        });
      }
    }
    const claimId = crypto.randomUUID();
    const lease = await admin.rpc("claim_email_access_session", {
      p_user_id: link.user_id,
      p_claim_id: claimId,
    });
    if (lease.error || !lease.data) {
      headers["Retry-After"] = "2";
      return reply(503, "temporarily_unavailable");
    }
    claim = { userId: link.user_id, id: claimId, exchangeFinished: false };
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: link.email });
    if (
      generated.error ||
      generated.data.user?.id !== link.user_id ||
      !generated.data.properties?.hashed_token
    ) {
      return reply(503, "temporarily_unavailable");
    }
    const verified = await verifier.auth.verifyOtp({
      type: "email",
      token_hash: generated.data.properties.hashed_token,
    });
    const session = verified.data.session;
    if (verified.error || !session || session.user.id !== link.user_id)
      return reply(503, "temporarily_unavailable");
    claim.exchangeFinished = true;
    const checked = await admin.auth.getUser(session.access_token);
    if (checked.error || checked.data.user.id !== link.user_id)
      return reply(503, "temporarily_unavailable");
    // Catch revocation, deletion, restrictions, or an email change during the Auth exchange.
    const valid = await resolve();
    if (valid.error) return reply(503, "temporarily_unavailable");
    if (!valid.data) return reply(401, "invalid_link");
    return reply(200, "authenticated", {
      reuseSession: false,
      userId: link.user_id,
      destination,
      session: { access_token: session.access_token, refresh_token: session.refresh_token },
    });
  } catch {
    return reply(503, "temporarily_unavailable");
  } finally {
    // A timed-out Auth call can still be running upstream. Keep its lease until
    // expiry instead of allowing an immediate overlapping generate/verify pair.
    if (claim?.exchangeFinished) {
      try {
        await admin.rpc("release_email_access_session", {
          p_user_id: claim.userId,
          p_claim_id: claim.id,
        });
      } catch {
        /* A crashed request's lease expires automatically. */
      }
    }
  }
}
