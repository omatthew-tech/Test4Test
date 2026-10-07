import { expect, it, vi } from "vitest";
import { checkAuthHealth } from "../../scripts/check-auth-health.mjs";

const config = { url: "https://auth.example.test", key: "sb_publishable_test" };
function healthyFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    const body = path.endsWith("/health")
      ? { name: "GoTrue", version: "v2.test" }
      : path.startsWith("/rest/v1/")
        ? []
        : { external: { email: true } };
    return new Response(JSON.stringify(body), {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers":
          "apikey,authorization,content-type,x-client-info,x-supabase-api-version",
      },
    });
  });
}

it("checks the real auth service and CORS without sending codes or exposing keys", async () => {
  const fetcher = healthyFetch();
  const results = await checkAuthHealth(config, fetcher);
  expect(results).toHaveLength(4);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual([
    "GET",
    "GET",
    "OPTIONS",
    "GET",
  ]);
  expect(String(fetcher.mock.calls[3][0])).toBe(
    "https://auth.example.test/rest/v1/submissions?select=id&limit=0",
  );
  expect(JSON.stringify(results)).not.toContain(config.key);
});

it("does not declare recovery while Auth is healthy but the database API is unavailable", async () => {
  const healthy = healthyFetch();
  const fetcher = vi.fn<typeof fetch>(async (input, init) =>
    new URL(String(input)).pathname.startsWith("/rest/v1/")
      ? new Response("Database unavailable", { status: 503 })
      : healthy(input, init),
  );
  const results = await checkAuthHealth(config, fetcher);
  expect(results.slice(0, 3).every((result) => result.ok)).toBe(true);
  expect(results[3]).toMatchObject({
    name: "Database API readiness",
    ok: false,
    error: "HTTP 503",
  });
});

it("rejects a successful database response that is not a zero-row result", async () => {
  const healthy = healthyFetch();
  const fetcher = vi.fn<typeof fetch>(async (input, init) =>
    new URL(String(input)).pathname.startsWith("/rest/v1/")
      ? new Response('{"status":"ok"}', {
          headers: { "access-control-allow-origin": "*" },
        })
      : healthy(input, init),
  );
  expect((await checkAuthHealth(config, fetcher))[3]).toMatchObject({
    ok: false,
    error: "Unexpected database readiness response",
  });
});

it("uses legacy anon authorization for the database probe without returning credentials", async () => {
  const key = `eyJ.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.test`;
  const fetcher = healthyFetch();
  const results = await checkAuthHealth({ ...config, key }, fetcher);
  expect(fetcher.mock.calls[3][1]?.headers).toMatchObject({
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
  expect(JSON.stringify(results)).not.toContain(key);
});

it("fails when the gateway is up but the auth origin is unavailable", async () => {
  const fetcher = healthyFetch().mockResolvedValueOnce(
    new Response("Gateway Timeout", { status: 504 }),
  );
  const results = await checkAuthHealth(config, fetcher);
  expect(results[0]).toMatchObject({ ok: false, error: "HTTP 504" });
  expect(results[2].ok).toBe(true);
});

it("fails if email auth is disabled or a successful response has no CORS", async () => {
  const fetcher = healthyFetch()
    .mockResolvedValueOnce(new Response('{"name":"GoTrue","version":"v2"}'))
    .mockResolvedValueOnce(
      new Response('{"external":{"email":false}}', {
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  const results = await checkAuthHealth(config, fetcher);
  expect(results[0]).toMatchObject({ ok: false, error: "Browser CORS origin is not allowed" });
  expect(results[1]).toMatchObject({ ok: false, error: "Email authentication is not enabled" });
});

it("rejects server-only credentials before any request", async () => {
  const fetcher = healthyFetch();
  await expect(checkAuthHealth({ ...config, key: "sb_secret_test" }, fetcher)).rejects.toThrow(
    "never a secret",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
