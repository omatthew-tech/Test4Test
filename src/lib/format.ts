import { ProductType } from "../types";

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

export function productTypeLabel(value: ProductType) {
  switch (value) {
    case "ios":
      return "IOS app";
    case "android":
      return "Android app";
    default:
      return "Website / Web app";
  }
}

export function productTypeBadge(value: ProductType) {
  switch (value) {
    case "ios":
      return "IOS";
    case "android":
      return "Android";
    default:
      return "Web";
  }
}

export function isNativeAppType(value: ProductType) {
  return value === "ios" || value === "android";
}

export function defaultAccessMethod(value: ProductType) {
  switch (value) {
    case "ios":
      return "App Store / TestFlight link";
    case "android":
      return "Google Play / Android link";
    default:
      return "Website";
  }
}