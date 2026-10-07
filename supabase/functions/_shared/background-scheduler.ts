export type SchedulerAction = "recover" | "maintain";

export async function schedulerRequest(
  request: Request,
  dependencies: {
    secret: string;
    run: (action: SchedulerAction) => Promise<unknown>;
  },
) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const provided = request.headers.get("x-background-scheduler-secret") ?? "";
  if (!dependencies.secret || !provided) return json({ error: "Unauthorized" }, 401);
  const hashes = await Promise.all(
    [provided, dependencies.secret].map((value) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
  const left = new Uint8Array(hashes[0]);
  const right = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  if (difference) return json({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  if (body?.action !== "recover" && body?.action !== "maintain")
    return json({ error: "Invalid scheduler action" }, 400);
  try {
    return json({ ok: true, result: await dependencies.run(body.action) });
  } catch {
    // No customer records, provider errors or credentials in responses/logs.
    return json({ error: "Background scheduler unavailable" }, 503);
  }
}
