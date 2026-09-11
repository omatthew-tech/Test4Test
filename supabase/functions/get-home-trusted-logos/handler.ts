import type { SubmissionSource } from "./cache.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
interface Dependencies {
  eligibleIds(): Promise<string[]>;
  sources(ids: string[]): Promise<SubmissionSource[]>;
  resolve(source: SubmissionSource): Promise<string | null>;
  prepare?(sources: SubmissionSource[]): Promise<Dependencies["resolve"]>;
}

export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let ids: string[];
    try {
      if (!request.body || Number(request.headers.get("content-length") ?? 0) > 4096)
        return json({ error: "Invalid request" }, 400);
      const reader = request.body.getReader();
      let text = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return json({ error: "Invalid request" }, 400);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      const body = JSON.parse(text);
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).length !== 1 ||
        !Array.isArray(body.submissionIds) ||
        body.submissionIds.length > 6 ||
        body.submissionIds.some(
          (id: unknown) =>
            typeof id !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id),
        )
      ) {
        return json({ error: "Expected at most six submission IDs" }, 400);
      }
      ids = [...new Set<string>(body.submissionIds.map((id: string) => id.toLowerCase()))];
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    try {
      if (!ids.length) return json({ logos: [] });
      const eligible = new Set(await deps.eligibleIds());
      if (ids.some((id) => !eligible.has(id)))
        return json({ error: "Submission is not in the public homepage feed" }, 403);
      const sources = new Map((await deps.sources(ids)).map((source) => [source.id, source]));
      const resolve = deps.prepare ? await deps.prepare([...sources.values()]) : deps.resolve;
      const logos = await Promise.all(
        ids.map(async (submissionId) => {
          const source = sources.get(submissionId);
          let logoUrl: string | null = null;
          if (source) {
            try {
              logoUrl = await resolve(source);
            } catch {
              console.error(JSON.stringify({ event: "home_logo_cache_error", submissionId }));
            }
          }
          return { submissionId, logoUrl };
        }),
      );
      return json({ logos });
    } catch {
      return json({ error: "Logo lookup temporarily unavailable" }, 503);
    }
  };
}
