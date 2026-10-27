export interface MediaBinding {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { submitMedia(request: Request): Promise<Response> };
}

/** Public probes, rejected requests and old image routes must never wake compute. */
export async function routeMediaRequest(
  request: Request,
  env: { WORKER_SHARED_SECRET: string; MEDIA: MediaBinding },
) {
  const path = new URL(request.url).pathname;
  const json = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (request.method === "GET" && path === "/healthz")
    return json({ ok: true, service: "media-gateway" });
  if (!env.WORKER_SHARED_SECRET) return json({ error: "Media worker is not configured." }, 503);
  if (request.headers.get("x-worker-secret") !== env.WORKER_SHARED_SECRET)
    return json({ error: "Unauthorized." }, 401);
  const legacyCleanup = path === "/frames/delete";
  if (
    path !== "/recordings/transcripts/process" &&
    path !== "/recordings/clips/process" &&
    !legacyCleanup
  )
    return json({ error: "Endpoint retired or unavailable." }, 410);
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  // Bound the request before starting a container. Only job references travel here.
  const limit = legacyCleanup ? 131_072 : 16_384;
  if (Number(request.headers.get("Content-Length")) > limit)
    return json({ error: "Job request is too large." }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength > limit) return json({ error: "Job request is too large." }, 413);
  try {
    const job = JSON.parse(new TextDecoder().decode(body));
    if (
      !job ||
      typeof job !== "object" ||
      (legacyCleanup
        ? !Array.isArray(job.frames) || job.frames.length === 0 || job.frames.length > 200
        : typeof job.attemptId !== "string" || !job.source)
    )
      return json({ error: "Invalid media job." }, 400);
  } catch {
    return json({ error: "Invalid media job." }, 400);
  }
  try {
    return await env.MEDIA.get(env.MEDIA.idFromName("media")).submitMedia(
      new Request(new URL(path, "http://media"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": env.WORKER_SHARED_SECRET,
        },
        body,
      }),
    );
  } catch (error) {
    // A cold start or replacement is recoverable through the durable job queue.
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    console.error(
      "Media container request failed:",
      message.replaceAll(env.WORKER_SHARED_SECRET, "[redacted]").slice(0, 400),
    );
    return json({ error: "Media worker is starting. Retry later." }, 503);
  }
}
