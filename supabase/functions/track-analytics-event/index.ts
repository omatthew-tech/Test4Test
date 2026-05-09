import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedEventNames = new Set([
  "site_visited",
  "product_name_entered",
  "submit_step_viewed",
  "email_signup_requested",
  "email_verified",
  "authenticated_visit",
  "test_started",
  "first_test_completed",
  "test_completed",
]);

interface AnalyticsRequestBody {
  eventName?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  metadata?: unknown;
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

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server secrets for analytics.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 120);
}

function normalizeMetadata(eventName: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const metadata = value as Record<string, unknown>;

  switch (eventName) {
    case "product_name_entered": {
      return metadata.source === "home" || metadata.source === "submit_flow"
        ? { source: metadata.source }
        : {};
    }
    case "submit_step_viewed": {
      const stepIndex = typeof metadata.stepIndex === "number" ? metadata.stepIndex : null;
      const stepName = typeof metadata.stepName === "string" ? metadata.stepName.slice(0, 120) : null;

      return {
        ...(Number.isInteger(stepIndex) ? { stepIndex } : {}),
        ...(stepName ? { stepName } : {}),
      };
    }
    case "test_started":
    case "first_test_completed":
    case "test_completed": {
      return typeof metadata.submissionId === "string"
        ? { submissionId: metadata.submissionId.slice(0, 120) }
        : {};
    }
    default:
      return {};
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let admin;

  try {
    admin = createAdminClient();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Analytics setup is incomplete." }, 500);
  }

  const payload = (await request.json().catch(() => ({}))) as AnalyticsRequestBody;
  const eventName = typeof payload.eventName === "string" ? payload.eventName.trim() : "";
  const visitorId = normalizeIdentifier(payload.visitorId);
  const sessionId = normalizeIdentifier(payload.sessionId);

  if (!allowedEventNames.has(eventName)) {
    return json({ error: "Unknown analytics event." }, 400);
  }

  if (!visitorId || !sessionId) {
    return json({ error: "Missing analytics identifiers." }, 400);
  }

  let userId: string | null = null;
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (accessToken) {
    const {
      data: { user },
    } = await admin.auth.getUser(accessToken);
    userId = user?.id ?? null;
  }

  const { error } = await admin.from("analytics_events").insert({
    event_name: eventName,
    visitor_id: visitorId,
    session_id: sessionId,
    user_id: userId,
    metadata: normalizeMetadata(eventName, payload.metadata),
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ ok: true });
});
