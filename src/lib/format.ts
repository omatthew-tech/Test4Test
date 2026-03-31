import { AccessLinks, ProductType } from "../types";

export const PRODUCT_TYPE_ORDER: ProductType[] = ["website", "ios", "android"];

export interface AccessLinkItem {
  productType: ProductType;
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

export function normalizeAccessLinks(accessLinks: AccessLinks) {
  const normalized: AccessLinks = {};

  PRODUCT_TYPE_ORDER.forEach((productType) => {
    const value = accessLinks[productType];

    if (typeof value === "string" && value.trim()) {
      normalized[productType] = value.trim();
    }
  });

  return normalized;
}

export function accessLinkFieldLabel(productType: ProductType) {
  switch (productType) {
    case "ios":
      return "iOS app link";
    case "android":
      return "Android app link";
    default:
      return "Website / Web app link";
  }
}

export function accessLinkButtonLabel(productType: ProductType) {
  switch (productType) {
    case "ios":
      return "Open iOS app";
    case "android":
      return "Open Android app";
    default:
      return "Open website";
  }
}

export function accessLinkPlaceholder(productType: ProductType) {
  switch (productType) {
    case "ios":
      return "apps.apple.com/app/... or testflight.apple.com/join/...";
    case "android":
      return "play.google.com/store/apps/...";
    default:
      return "yourapp.com";
  }
}

export function getOrderedAccessLinks(accessLinks: AccessLinks, productTypes: ProductType[] = []) {
  const normalizedLinks = normalizeAccessLinks(accessLinks);
  const orderedTypes = normalizeProductTypes(productTypes);
  const sourceTypes = orderedTypes.length > 0
    ? orderedTypes
    : PRODUCT_TYPE_ORDER.filter((productType) => Boolean(normalizedLinks[productType]));

  return sourceTypes.flatMap((productType) => {
    const url = normalizedLinks[productType];

    if (!url) {
      return [];
    }

    return [{
      productType,
      label: productTypeLabel(productType),
      buttonLabel: accessLinkButtonLabel(productType),
      fieldLabel: accessLinkFieldLabel(productType),
      placeholder: accessLinkPlaceholder(productType),
      url,
      normalizedUrl: normalizeAccessUrl(url),
      displayUrl: displayAccessUrl(url),
    } satisfies AccessLinkItem];
  });
}

export function getPrimaryAccessLink(accessLinks: AccessLinks, productTypes: ProductType[] = []) {
  return getOrderedAccessLinks(accessLinks, productTypes)[0] ?? null;
}

export function accessLinksSummary(accessLinks: AccessLinks, productTypes: ProductType[] = []) {
  const orderedLinks = getOrderedAccessLinks(accessLinks, productTypes);
  return orderedLinks.map((link) => `${link.label}: ${link.displayUrl}`).join(" | ");
}