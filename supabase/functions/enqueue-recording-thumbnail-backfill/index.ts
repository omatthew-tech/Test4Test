import { recordingJson } from "../_shared/response-recordings.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return recordingJson({ error: "Method not allowed." }, 405);
  }

  const configuredSecret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim() ?? "";
  const providedSecret = request.headers.get("x-worker-secret")?.trim() ?? "";
  if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
    return recordingJson({ error: "Unauthorized." }, 401);
  }

  // Screenshot generation is retired. Old schedules receive a terminal result.
  return recordingJson({ ok: true, retired: true, complete: true, queuedIds: [] });
});
