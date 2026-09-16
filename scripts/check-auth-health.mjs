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
    { name: "Auth health", path: "health", headers },
    { name: "Email provider", path: "settings", headers },
    {
      name: "OTP preflight",
      path: "otp",
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "apikey,authorization,content-type,x-client-info,x-supabase-api-version",
      },
    },
  ];
  return Promise.all(
    probes.map(async (probe) => {
      const started = Date.now();
      try {
        const response = await fetcher(new URL(`/auth/v1/${probe.path}`, base), {
          method: probe.method ?? "GET",
          headers: probe.headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cors = response.headers.get("access-control-allow-origin");
        if (cors !== "*" && cors !== origin) throw new Error("Browser CORS origin is not allowed");
        if (probe.path === "health") {
          const body = await response.json();
          if (body.name !== "GoTrue" || !body.version)
            throw new Error("Unexpected Auth health response");
        } else if (probe.path === "settings") {
          const body = await response.json();
          if (body.external?.email !== true) throw new Error("Email authentication is not enabled");
        } else {
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
