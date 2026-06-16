import type { Submission } from "../types";

export function slugifyShareName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || "test";
}

export function buildShareUrlFromSlug(slug: string) {
  const path = `/test/${slug}`;

  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function buildReadableShareUrl(
  submission: Pick<Submission, "productName" | "publicShareSlug">,
) {
  return buildShareUrlFromSlug(
    submission.publicShareSlug?.trim() || slugifyShareName(submission.productName),
  );
}
