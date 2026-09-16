import { expect, it, vi } from "vitest";
import { checkAuthHealth } from "../../scripts/check-auth-health.mjs";

const config = { url: "https://auth.example.test", key: "sb_publishable_test" };
function healthyFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    const body = path.endsWith("/health")
      ? { name: "GoTrue", version: "v2.test" }
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
  expect(results).toHaveLength(3);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "GET", "OPTIONS"]);
  expect(JSON.stringify(results)).not.toContain(config.key);
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
