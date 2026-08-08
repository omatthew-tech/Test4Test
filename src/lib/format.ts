import { AccessLinkKind, AccessLinks, ProductType } from "../types";

export const PRODUCT_TYPE_ORDER: ProductType[] = ["website", "ios", "android"];
export const ACCESS_LINK_KIND_ORDER: AccessLinkKind[] = [
  "website",
  "ios",
  "android",
  "figma",
  "other",
];

export interface AccessLinkItem {
  kind: AccessLinkKind;
  productType: ProductType | null;
  label: string;
  buttonLabel: string;
  fieldLabel: string;
  placeholder: string;
  url: string;
  normalizedUrl: string;
  displayUrl: string;
}

function joinWithAnd(values: string[]) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCalendarDate(value: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function minutesLabel(value: number) {
  return `${value} min`;
}

export function normalizeAccessUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed}`;
}

export function displayAccessUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(normalizeAccessUrl(trimmed));
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}

export function productTypeLabel(value: ProductType) {
  switch (value) {
    case "ios":
      return "iOS app";
    case "android":
      return "Android app";
    default:
      return "Website / Web app";
  }
}

export function productTypeBadge(value: ProductType) {
  switch (value) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    default:
      return "Web";
  }
}

export function normalizeProductTypes(values: ProductType[]): ProductType[] {
  const requested = new Set<ProductType>(values);
  return PRODUCT_TYPE_ORDER.filter((type) => requested.has(type));
}

export function productTypesLabel(values: ProductType[]) {
  const productTypes = normalizeProductTypes(values);
  return productTypes.length > 0 ? joinWithAnd(productTypes.map(productTypeLabel)) : "";
}

export function productTypesBadges(values: ProductType[]) {
  return normalizeProductTypes(values).map(productTypeBadge);
}

export function isNativeAppType(value: ProductType) {
  return value === "ios" || value === "android";
}

export function hasNativeProductTypes(values: ProductType[]) {
  return normalizeProductTypes(values).some(isNativeAppType);
}

export function normalizeAccessLinks(accessLinks: unknown) {
  const normalized: AccessLinks = {};

  if (!accessLinks || typeof accessLinks !== "object" || Array.isArray(accessLinks)) {
    return normalized;
  }

  const source = accessLinks as Record<string, unknown>;

  (["website", "ios", "android", "figma"] as const).forEach((kind) => {
    const value = source[kind];

    if (typeof value === "string" && value.trim()) {
      normalized[kind] = value.trim();
    }
  });

  const other = source.other;

  if (typeof other === "string" && other.trim()) {
    normalized.other = { label: "Other", url: other.trim() };
  } else if (other && typeof other === "object" && !Array.isArray(other)) {
    const candidate = other as Record<string, unknown>;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";

    if (label && url) {
      normalized.other = { label, url };
    }
  }

  return normalized;
}

export function productTypesFromAccessLinks(accessLinks: unknown) {
  const normalized = normalizeAccessLinks(accessLinks);
  return PRODUCT_TYPE_ORDER.filter((productType) => Boolean(normalized[productType]));
}

export function accessLinkFieldLabel(kind: AccessLinkKind, isGooglePlayClosedTest = false) {
  switch (kind) {
    case "ios":
      return "iOS app link";
    case "android":
      if (isGooglePlayClosedTest) {
        return "Google Play closed-test link";
      }

      return "Android app link";
    case "figma":
      return "Figma link";
    case "other":
      return "Other link";
    default:
      return "Website / Web app link";
  }
}

export function accessLinkButtonLabel(kind: AccessLinkKind, otherLabel = "Other") {
  switch (kind) {
    case "ios":
      return "Open iOS app";
    case "android":
      return "Open Android app";
    case "figma":
      return "Open Figma";
    case "other":
      return `Open ${otherLabel}`;
    default:
      return "Open website";
  }
}

export function accessLinkPlaceholder(kind: AccessLinkKind, isGooglePlayClosedTest = false) {
  switch (kind) {
    case "ios":
      return "apps.apple.com/app/... or testflight.apple.com/join/...";
    case "android":
      if (isGooglePlayClosedTest) {
        return "play.google.com/apps/testing/...";
      }

      return "play.google.com/store/apps/...";
    case "figma":
      return "figma.com/proto/...";
    case "other":
      return "example.com/demo";
    default:
      return "yourapp.com";
  }
}

export function getOrderedAccessLinks(accessLinks: AccessLinks, productTypes: ProductType[] = []) {
  const normalizedLinks = normalizeAccessLinks(accessLinks);
  const orderedTypes = normalizeProductTypes(productTypes);
  const sourceKinds: AccessLinkKind[] =
    orderedTypes.length > 0
      ? [
          ...orderedTypes.filter((productType) => Boolean(normalizedLinks[productType])),
          ...(["figma", "other"] as const).filter((kind) => Boolean(normalizedLinks[kind])),
        ]
      : ACCESS_LINK_KIND_ORDER.filter((kind) => Boolean(normalizedLinks[kind]));

  return sourceKinds.flatMap((kind) => {
    const value = normalizedLinks[kind];

    if (!value) {
      return [];
    }

    const otherLabel = kind === "other" && typeof value !== "string" ? value.label : "Other";
    const url = typeof value === "string" ? value : value.url;
    const productType = PRODUCT_TYPE_ORDER.includes(kind as ProductType)
      ? (kind as ProductType)
      : null;
    const label =
      kind === "other"
        ? otherLabel
        : kind === "figma"
          ? "Figma"
          : productTypeLabel(kind as ProductType);

    return [
      {
        kind,
        productType,
        label,
        buttonLabel: accessLinkButtonLabel(kind, otherLabel),
        fieldLabel: accessLinkFieldLabel(kind),
        placeholder: accessLinkPlaceholder(kind),
        url,
        normalizedUrl: normalizeAccessUrl(url),
        displayUrl: displayAccessUrl(url),
      } satisfies AccessLinkItem,
    ];
  });
}

export function getPrimaryAccessLink(accessLinks: AccessLinks, productTypes: ProductType[] = []) {
  return getOrderedAccessLinks(accessLinks, productTypes)[0] ?? null;
}

export function accessLinksSummary(accessLinks: AccessLinks, productTypes: ProductType[] = []) {
  const orderedLinks = getOrderedAccessLinks(accessLinks, productTypes);
  return orderedLinks.map((link) => `${link.label}: ${link.displayUrl}`).join(" | ");
}
