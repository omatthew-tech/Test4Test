import { ProductType } from "../types";

export const PRODUCT_TYPE_ORDER: ProductType[] = ["website", "ios", "android"];

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
  const normalized: ProductType[] = PRODUCT_TYPE_ORDER.filter((type) => requested.has(type));
  return normalized.length > 0 ? normalized : ["website"];
}

export function productTypesLabel(values: ProductType[]) {
  if (values.length === 0) {
    return "";
  }

  return joinWithAnd(normalizeProductTypes(values).map(productTypeLabel));
}

export function productTypesBadges(values: ProductType[]) {
  if (values.length === 0) {
    return [];
  }

  return normalizeProductTypes(values).map(productTypeBadge);
}

export function isNativeAppType(value: ProductType) {
  return value === "ios" || value === "android";
}

export function hasNativeProductTypes(values: ProductType[]) {
  return normalizeProductTypes(values).some(isNativeAppType);
}

export function defaultAccessMethod(values: ProductType[]) {
  if (values.length === 0) {
    return "";
  }

  const productTypes = normalizeProductTypes(values);

  if (productTypes.length === 1) {
    switch (productTypes[0]) {
      case "ios":
        return "App Store / TestFlight link";
      case "android":
        return "Google Play / Android link";
      default:
        return "Website";
    }
  }

  if (productTypes.includes("website")) {
    return "Public website, beta, or store link";
  }

  return "App Store, Google Play, or beta link";
}


