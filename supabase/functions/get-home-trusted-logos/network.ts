import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { buildConnector, Client } from "undici";

export const MAX_BYTES = 2 * 1024 * 1024;
export const DISCOVERY_TIMEOUT_MS = 15_000;

export class LogoError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface PageResource {
  url: string;
  contentType: string;
  bytes: Uint8Array;
}
export type FetchResource = (url: string, signal: AbortSignal) => Promise<PageResource>;

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  if (parsed.range() !== "unicast") return false;
  // Accept only global unicast IPv6, excluding transition/reserved address ranges.
  return parsed.kind() === "ipv4" || parsed.match(ipaddr.parseCIDR("2000::/3"));
}

export function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) ||
    (!ipaddr.isValid(hostname) &&
      (!hostname.includes(".") ||
        /\.(localhost|local|internal|test|invalid|onion)\.?$/i.test(hostname))) ||
    (ipaddr.isValid(hostname) && !isPublicAddress(hostname))
  )
    throw new LogoError("unsafe_source");
  url.hash = "";
  return url.href;
}

export async function resolvePublicAddress(
  hostname: string,
  resolve = lookup,
): Promise<{ address: string; family: number }> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(literal)
    ? [{ address: literal, family: ipaddr.parse(literal).kind() === "ipv4" ? 4 : 6 }]
    : await resolve(literal, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new LogoError("unsafe_address");
  }
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

interface HttpResult extends PageResource {
  status: number;
  location?: string;
}

// Supabase's node:https shim uses fetch and ignores `servername`. Use an explicit
// socket connector so pinning the IP preserves SNI and certificate verification.
export function createPinnedConnector(
  url: URL,
  address: string,
  connect = buildConnector({ timeout: DISCOVERY_TIMEOUT_MS, rejectUnauthorized: true }),
): buildConnector.connector {
  if (!isPublicAddress(address)) throw new LogoError("unsafe_address");
  return (options, callback) =>
    connect(
      {
        ...options,
        hostname: address,
        servername: url.hostname.replace(/^\[|\]$/g, ""),
        protocol: url.protocol,
        port: url.protocol === "https:" ? "443" : "80",
      },
      callback,
    );
}

// A second, uncontrolled DNS lookup never occurs, including after redirects.
async function requestPinned(url: URL, signal: AbortSignal): Promise<HttpResult> {
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new LogoError("timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const target = await Promise.race([resolvePublicAddress(url.hostname), aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
  signal.throwIfAborted();
  const client = new Client(url.origin, {
    connect: createPinnedConnector(url, target.address),
    headersTimeout: DISCOVERY_TIMEOUT_MS,
    bodyTimeout: DISCOVERY_TIMEOUT_MS,
    maxResponseSize: MAX_BYTES,
    // Keep HTTP/1.1 alive until the framed response is consumed. Some origins
    // close without TLS close_notify when asked to close, which older hosted
    // Deno versions surface as UnexpectedEof. The finally block closes our socket.
    pipelining: 1,
  });
  try {
    const {
      statusCode: status,
      headers,
      body,
    } = await client.request({
      path: `${url.pathname}${url.search}`,
      method: "GET",
      signal,
      headers: {
        Host: url.host,
        "User-Agent": "Test4Test-BrandIcons/1.0 (+https://test4test.io)",
        Accept: "text/html,application/manifest+json,application/json,image/*;q=0.9,*/*;q=0.1",
        "Accept-Encoding": "identity",
      },
    });
    const contentType = String(headers["content-type"] ?? "")
      .split(";")[0]
      .trim();
    if ([301, 302, 303, 307, 308].includes(status)) {
      return {
        status,
        location: typeof headers.location === "string" ? headers.location : undefined,
        url: url.href,
        contentType,
        bytes: new Uint8Array(),
      };
    }
    if (
      status !== 200 ||
      Number(headers["content-length"] ?? 0) > MAX_BYTES ||
      (headers["content-encoding"] && headers["content-encoding"] !== "identity")
    ) {
      throw new LogoError(status !== 200 ? "upstream_status" : "invalid_size_or_encoding");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new LogoError("too_large");
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status, url: url.href, contentType, bytes };
  } finally {
    await client.destroy();
  }
}

export async function followPublicRedirects(
  value: string,
  signal: AbortSignal,
  request = requestPinned,
): Promise<PageResource> {
  let url = new URL(normalizeSourceUrl(value));
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    signal.throwIfAborted();
    const result = await request(url, signal);
    if (result.status === 200) return result;
    if (!result.location || redirects === 3) throw new LogoError("redirect_limit");
    const next = new URL(normalizeSourceUrl(new URL(result.location, url).href));
    if (url.protocol === "https:" && next.protocol !== "https:")
      throw new LogoError("unsafe_redirect");
    url = next;
  }
  throw new LogoError("redirect_limit");
}

export const fetchPublicResource: FetchResource = followPublicRedirects;
