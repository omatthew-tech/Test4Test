import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
} from "./response-recordings.ts";

export class ClipError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export const clipUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const clipToken = /^[0-9a-f]{64}$/;
export async function hashClipToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function clipJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...recordingCorsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-worker-secret, x-transcript-dispatch-secret",
    },
  });
}
export type ClipAdmin = ReturnType<typeof createRecordingAdminClient>;
export async function clipHandler(
  request: Request,
  role: "client" | "worker" | "dispatcher",
  handler: (context: {
    admin: ClipAdmin;
    userId: string;
    body: Record<string, unknown>;
  }) => Promise<Response>,
) {
  if (request.method === "OPTIONS") return clipJson({ ok: true });
  if (request.method !== "POST") return clipJson({ error: "Method not allowed." }, 405);
  try {
    const admin = createRecordingAdminClient(getRecordingEnvironment());
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ClipError("Invalid request.");
    let userId = "";
    if (role !== "client") {
      const expected = Deno.env
        .get(role === "worker" ? "VIDEO_PROCESSOR_SHARED_SECRET" : "TRANSCRIPT_DISPATCH_SECRET")
        ?.trim();
      const provided = request.headers.get(
        role === "worker" ? "x-worker-secret" : "x-transcript-dispatch-secret",
      );
      if (
        !expected ||
        !provided ||
        (await hashClipToken(expected)) !== (await hashClipToken(provided))
      )
        throw new ClipError("Unauthorized.", 401);
    } else if (body.action !== "public") {
      const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!token) throw new ClipError("Sign in to create or manage clips.", 401);
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(token);
      if (error || !user) throw new ClipError("Sign in to create or manage clips.", 401);
      userId = user.id;
    }
    return await handler({ admin, userId, body });
  } catch (error) {
    if (error instanceof ClipError) return clipJson({ error: error.message }, error.status);
    console.error("Clip endpoint failed");
    return clipJson({ error: "Clips are temporarily unavailable. Please try again." }, 503);
  }
}
