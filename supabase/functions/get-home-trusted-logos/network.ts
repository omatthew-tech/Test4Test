import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

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

// Connect to the validated IP itself. TLS still authenticates the original hostname.
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
  return await new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: target.address,
        family: target.family,
        port: url.protocol === "https:" ? 443 : 80,
        servername: url.hostname.replace(/^\[|\]$/g, ""),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        signal,
        headers: {
          Host: url.host,
          "User-Agent": "Test4Test-BrandIcons/1.0 (+https://test4test.io)",
          Accept: "text/html,application/manifest+json,application/json,image/*;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 500;
        const contentType = String(response.headers["content-type"] ?? "")
          .split(";")[0]
          .trim();
        if ([301, 302, 303, 307, 308].includes(status)) {
          resolve({
            status,
            location: response.headers.location,
            url: url.href,
            contentType,
            bytes: new Uint8Array(),
          });
          response.destroy();
          return;
        }
        if (
          status !== 200 ||
          Number(response.headers["content-length"] ?? 0) > MAX_BYTES ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity")
        ) {
          reject(new LogoError(status !== 200 ? "upstream_status" : "invalid_size_or_encoding"));
          response.destroy();
          return;
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        response.on("data", (chunk: Uint8Array) => {
          size += chunk.byteLength;
          if (size > MAX_BYTES) {
            reject(new LogoError("too_large"));
            response.destroy();
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("aborted", () => reject(new LogoError("upstream_aborted")));
        response.on("end", () => {
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          resolve({ status, url: url.href, contentType, bytes });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
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
