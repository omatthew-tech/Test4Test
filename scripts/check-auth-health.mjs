import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";

// Read-only probes: never request an OTP, create a user, or print credentials.
export async function checkAuthHealth(
  { url, key, origin = "https://test4test.io" },
  fetcher = fetch,
) {
  const base = new URL(url);
  if (
    base.protocol !== "https:" &&
    base.hostname !== "localhost" &&
    base.hostname !== "127.0.0.1"
  ) {
    throw new Error("Auth health checks require HTTPS outside local development.");
  }
  if (!key) throw new Error("A browser-safe Supabase key is required.");
  const role = key.startsWith("eyJ")
    ? JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role
    : null;
  if (!key.startsWith("sb_publishable_") && role !== "anon") {
    throw new Error("Use a publishable or anon key, never a secret or service-role key.");
  }

  const headers = { apikey: key, Origin: origin };
  const probes = [
    { name: "Auth health", path: "/auth/v1/health", headers },
    { name: "Email provider", path: "/auth/v1/settings", headers },
    {
      name: "OTP preflight",
      path: "/auth/v1/otp",
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "apikey,authorization,content-type,x-client-info,x-supabase-api-version",
      },
    },
    {
      // Auth can recover before PostgREST. Read zero rows through the actual
      // database API; gateway preflight and API metadata can succeed offline.
      name: "Database API readiness",
      path: "/rest/v1/submissions?select=id&limit=0",
      headers: role === "anon" ? { ...headers, Authorization: `Bearer ${key}` } : headers,
    },
  ];
  return Promise.all(
    probes.map(async (probe) => {
      const started = Date.now();
      try {
        const response = await fetcher(new URL(probe.path, base), {
          method: probe.method ?? "GET",
          headers: probe.headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cors = response.headers.get("access-control-allow-origin");
        if (cors !== "*" && cors !== origin) throw new Error("Browser CORS origin is not allowed");
        if (probe.path === "/auth/v1/health") {
          const body = await response.json();
          if (body.name !== "GoTrue" || !body.version)
            throw new Error("Unexpected Auth health response");
        } else if (probe.path === "/auth/v1/settings") {
          const body = await response.json();
          if (body.external?.email !== true) throw new Error("Email authentication is not enabled");
        } else if (probe.method === "OPTIONS") {
          const methods =
            response.headers
              .get("access-control-allow-methods")
              ?.toUpperCase()
              .split(/\s*,\s*/) ?? [];
          const allowed =
            response.headers
              .get("access-control-allow-headers")
              ?.toLowerCase()
              .split(/\s*,\s*/) ?? [];
          if (!methods.includes("POST")) throw new Error("OTP POST is not allowed by CORS");
          for (const name of probe.headers["Access-Control-Request-Headers"].split(",")) {
            if (!allowed.includes(name) && !allowed.includes("*"))
              throw new Error(`CORS is missing ${name}`);
          }
        } else {
          const body = await response.json();
          if (!Array.isArray(body) || body.length !== 0) {
            throw new Error("Unexpected database readiness response");
          }
        }
        return { name: probe.name, ok: true, milliseconds: Date.now() - started };
      } catch (error) {
        return {
          name: probe.name,
          ok: false,
          milliseconds: Date.now() - started,
          error: error.name === "TimeoutError" ? "Timed out after 15 seconds" : error.message,
        };
      }
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = { ...loadEnv("production", process.cwd(), "VITE_"), ...process.env };
    console.log(`Backend health check at ${new Date().toISOString()}`);
    const results = await checkAuthHealth({
      url: env.VITE_SUPABASE_URL,
      key: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY,
      origin: env.AUTH_CHECK_ORIGIN || "https://test4test.io",
    });
    for (const result of results) {
      console.log(
        `${result.ok ? "PASS" : "FAIL"} ${result.name} (${result.milliseconds}ms)${result.error ? `: ${result.error}` : ""}`,
      );
    }
    if (results.some((result) => !result.ok)) process.exitCode = 1;
  } catch (error) {
    console.error(`Auth health check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
