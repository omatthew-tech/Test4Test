import { DOMParser } from "linkedom";
import { imageSize } from "image-size";
import {
  fetchPublicResource,
  LogoError,
  MAX_BYTES,
  normalizeSourceUrl,
  type FetchResource,
  type PageResource,
} from "./network.ts";

export interface LogoAsset {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  sourceImageUrl: string;
}

const svgTags = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "text",
  "tspan",
  "title",
  "desc",
]);
const svgAttributes = new Set([
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "id",
  "fill-rule",
  "clip-rule",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "offset",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "fx",
  "fy",
  "fr",
  "maskUnits",
  "maskContentUnits",
  "clipPathUnits",
  "text-anchor",
  "dominant-baseline",
  "font-family",
  "font-size",
  "font-weight",
  "dx",
  "dy",
  "preserveAspectRatio",
]);
const paintAttributes = new Set(["fill", "stroke", "stop-color", "clip-path", "mask"]);
const opacityAttributes = new Set(["opacity", "fill-opacity", "stroke-opacity", "stop-opacity"]);
const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rebuild a static SVG from an allowlist. No external references, CSS, entities,
// event handlers, animation, scripts, foreignObject, or recursive <use> survive.
export function sanitizeSvg(text: string): Uint8Array {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new LogoError("unsafe_svg");
  const document = new DOMParser().parseFromString(text, "image/svg+xml") as unknown as Document;
  const root = document?.documentElement;
  if (!root || root.localName !== "svg" || root.querySelector("parsererror"))
    throw new LogoError("invalid_svg");
  let count = 0;
  const attribute = (name: string, value: string): string => {
    if (paintAttributes.has(name)) {
      if (
        !/^(?:none|currentColor|transparent|[a-z]+|#[a-f\d]{3,8}|rgba?\([\d.,%\s]+\)|url\(#[a-z_][\w.-]*\))$/i.test(
          value,
        )
      )
        return "";
    } else if (opacityAttributes.has(name)) {
      if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?|\d+(?:\.\d+)?%)$/.test(value)) return "";
    } else if (!svgAttributes.has(name) || /[\\<>]|url\s*\(|javascript:|data:/i.test(value))
      return "";
    return ` ${name}="${escapeXml(value)}"`;
  };
  const render = (element: Element, depth: number): string => {
    if (++count > 1500 || depth > 40) throw new LogoError("svg_complexity");
    const tag = element.localName;
    if (!svgTags.has(tag)) return "";
    let attrs = tag === "svg" ? ' xmlns="http://www.w3.org/2000/svg"' : "";
    for (const item of Array.from(element.attributes)) {
      if (item.name === "style") {
        for (const rule of item.value.split(";")) {
          const [name, value] = rule.split(":").map((part) => part.trim());
          if (paintAttributes.has(name) || opacityAttributes.has(name))
            attrs += attribute(name, value ?? "");
        }
      } else attrs += attribute(item.name, item.value);
    }
    const children = Array.from(element.childNodes)
      .map((node) => {
        if (node.nodeType === 1) return render(node as Element, depth + 1);
        return node.nodeType === 3 && ["text", "tspan", "title", "desc"].includes(tag)
          ? escapeXml(node.textContent ?? "")
          : "";
      })
      .join("");
    return `<${tag}${attrs}>${children}</${tag}>`;
  };
  const output = render(root as unknown as Element, 0);
  if (!/<(?:path|rect|circle|ellipse|line|polyline|polygon|text)[\s>]/.test(output))
    throw new LogoError("empty_svg");
  return new TextEncoder().encode(output);
}

export function validateLogo(resource: PageResource): LogoAsset {
  if (!resource.bytes.length || resource.bytes.length > MAX_BYTES)
    throw new LogoError("invalid_image_size");
  const textStart = new TextDecoder().decode(resource.bytes.slice(0, 500)).trimStart();
  if (resource.contentType === "image/svg+xml" || /^(?:<\?xml[^>]*>\s*)?<svg\b/.test(textStart)) {
    return {
      bytes: sanitizeSvg(new TextDecoder().decode(resource.bytes)),
      contentType: "image/svg+xml",
      extension: "svg",
      sourceImageUrl: resource.url,
    };
  }
  // image-size identifies the format from its bytes, not an untrusted header or suffix.
  const size = imageSize(resource.bytes);
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
  };
  if (
    !size.type ||
    !types[size.type] ||
    !size.width ||
    !size.height ||
    size.width > 4096 ||
    size.height > 4096 ||
    size.width / size.height > 4 ||
    size.height / size.width > 4
  ) {
    throw new LogoError("invalid_image");
  }
  return {
    bytes: resource.bytes,
    contentType: types[size.type],
    extension: size.type,
    sourceImageUrl: resource.url,
  };
}

interface Candidate {
  url: string;
  score: number;
}

function imageReference(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return typeof object.url === "string"
      ? object.url
      : typeof object.contentUrl === "string"
        ? object.contentUrl
        : null;
  }
  return null;
}

function structuredImages(value: unknown, storeOnly: boolean, depth = 0): string[] {
  if (!value || typeof value !== "object" || depth > 12) return [];
  if (Array.isArray(value))
    return value.flatMap((entry) => structuredImages(entry, storeOnly, depth + 1));
  const object = value as Record<string, unknown>;
  const types = [object["@type"]].flat();
  const isApp = types.some(
    (type) => type === "SoftwareApplication" || type === "MobileApplication",
  );
  const isOrganization = types.some((type) => type === "Organization" || type === "Corporation");
  const values = isApp
    ? [object.image, object.logo]
    : !storeOnly && isOrganization
      ? [object.logo]
      : [];
  return [
    ...values
      .flat()
      .map(imageReference)
      .filter((item): item is string => Boolean(item)),
    ...Object.values(object).flatMap((entry) => structuredImages(entry, storeOnly, depth + 1)),
  ];
}

function sizeScore(sizes: string | null): number {
  if (sizes === "any") return 90;
  return Math.max(
    0,
    ...(sizes ?? "").split(/\s+/).map((size) => {
      const [width, height] = size.split("x").map(Number);
      return width === height && width >= 32 ? Math.min(width, 192) / 2 : 0;
    }),
  );
}

export async function discoverLogo(
  destination: string,
  signal: AbortSignal,
  options: { fetch?: FetchResource; overrideUrl?: string; appStoreOnly?: boolean } = {},
): Promise<LogoAsset | null> {
  const fetch = options.fetch ?? fetchPublicResource;
  if (options.overrideUrl) {
    try {
      return validateLogo(await fetch(options.overrideUrl, signal));
    } catch {
      signal.throwIfAborted();
    }
  }
  const page = await fetch(destination, signal);
  const pageUrl = new URL(page.url);
  const storeOnly =
    options.appStoreOnly || ["apps.apple.com", "play.google.com"].includes(pageUrl.hostname);
  if (storeOnly && !["apps.apple.com", "play.google.com"].includes(pageUrl.hostname)) return null;
  if (!/^(text\/html|application\/xhtml\+xml)$/.test(page.contentType)) return null;
  const document = new DOMParser().parseFromString(
    new TextDecoder().decode(page.bytes),
    "text/html",
  ) as unknown as Document;
  if (!document) return null;
  let base = page.url;
  const baseHref = document.querySelector("base[href]")?.getAttribute("href");
  if (baseHref) {
    try {
      base = normalizeSourceUrl(new URL(baseHref, page.url).href);
    } catch {
      /* Keep the final page URL. */
    }
  }
  const candidates: Candidate[] = [];
  const add = (href: string | null, score: number, relativeTo = base) => {
    if (!href || candidates.length >= 48) return;
    try {
      candidates.push({ url: normalizeSourceUrl(new URL(href, relativeTo).href), score });
    } catch {
      /* Ignore unsafe metadata. */
    }
  };
  if (!storeOnly) {
    for (const link of Array.from(document.querySelectorAll("link[href]"))) {
      const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      if (
        rel.some((value) =>
          ["icon", "apple-touch-icon", "apple-touch-icon-precomposed"].includes(value),
        )
      ) {
        add(link.getAttribute("href"), 200 + sizeScore(link.getAttribute("sizes")));
      }
    }
    const manifestHref = document
      .querySelector('link[rel~="manifest"][href]')
      ?.getAttribute("href");
    if (manifestHref) {
      try {
        const manifest = await fetch(normalizeSourceUrl(new URL(manifestHref, base).href), signal);
        const data = JSON.parse(new TextDecoder().decode(manifest.bytes));
        if (Array.isArray(data.icons)) {
          for (const icon of data.icons.slice(0, 16)) {
            if (
              typeof icon.src === "string" &&
              (!icon.purpose || String(icon.purpose).split(/\s+/).includes("any"))
            ) {
              add(
                icon.src,
                220 + sizeScore(typeof icon.sizes === "string" ? icon.sizes : null),
                manifest.url,
              );
            }
          }
        }
      } catch {
        signal.throwIfAborted();
      }
    }
  }
  for (const script of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).slice(0, 16)) {
    try {
      for (const image of structuredImages(
        JSON.parse(script.textContent ?? ""),
        Boolean(storeOnly),
      ))
        add(image, 100);
    } catch {
      /* Malformed structured data is not fatal. */
    }
  }
  if (!storeOnly) add("/favicon.ico", -1, page.url);
  const tried = new Set<string>();
  for (const candidate of candidates.sort((first, second) => second.score - first.score)) {
    if (tried.has(candidate.url)) continue;
    tried.add(candidate.url);
    if (tried.size > 8) break;
    signal.throwIfAborted();
    try {
      return validateLogo(await fetch(candidate.url, signal));
    } catch {
      signal.throwIfAborted();
    }
  }
  return null;
}
