import {
  createRecordingAdminClient,
  getRecordingEnvironment,
  recordingCorsHeaders,
} from "./response-recordings.ts";

export class TranscriptHttpError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function transcriptJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...recordingCorsHeaders,
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-worker-secret, x-transcript-dispatch-secret",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function transcriptHandler(
  request: Request,
  role: "owner" | "worker" | "dispatcher",
  handler: (context: {
    admin: ReturnType<typeof createRecordingAdminClient>;
    userId: string;
    body: Record<string, unknown>;
  }) => Promise<Response>,
) {
  if (request.method === "OPTIONS") return transcriptJson({ ok: true });
  if (request.method !== "POST") return transcriptJson({ error: "Method not allowed." }, 405);
  try {
    const admin = createRecordingAdminClient(getRecordingEnvironment());
    let userId = "";
    if (role === "owner") {
      const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!token) throw new TranscriptHttpError("Sign in to view transcripts.", 401);
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(token);
      if (error || !user) throw new TranscriptHttpError("Sign in to view transcripts.", 401);
      userId = user.id;
    } else {
      const secretName =
        role === "worker" ? "VIDEO_PROCESSOR_SHARED_SECRET" : "TRANSCRIPT_DISPATCH_SECRET";
      const header = role === "worker" ? "x-worker-secret" : "x-transcript-dispatch-secret";
      const expected = Deno.env.get(secretName)?.trim() ?? "";
      const provided = request.headers.get(header) ?? "";
      if (!expected || !provided || !(await equalSecret(expected, provided))) {
        throw new TranscriptHttpError("Unauthorized.", 401);
      }
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new TranscriptHttpError("Invalid request.");
    return await handler({ admin, userId, body });
  } catch (error) {
    if (error instanceof TranscriptHttpError)
      return transcriptJson({ error: error.message }, error.status);
    // Database/provider errors can include source text or credentials. Do not log their payloads.
    console.error("Transcript endpoint failed");
    return transcriptJson({ error: "Transcripts are temporarily unavailable. Try again." }, 503);
  }
}

async function equalSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all(
    [a, b].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
  const l = new Uint8Array(left),
    r = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < l.length; i++) difference |= l[i] ^ r[i];
  return difference === 0;
}
