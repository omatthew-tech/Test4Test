import { useEffect } from "react";

export const siteTitle = "Test4Test";
export const siteUrl = "https://test4test.io";
export const defaultDescription =
  "Test4Test is a warm, fast usability testing platform where users earn feedback credits by testing other products.";

export interface PageMetadata {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  noindex?: boolean;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown>;
}

export interface ResolvedPageMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl?: string;
  noindex: boolean;
  type: "website" | "article";
  jsonLd?: Record<string, unknown>;
}

function getMetaDescriptionElement() {
  let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');

  if (!metaDescription) {
    metaDescription = document.createElement("meta");
    metaDescription.name = "description";
    document.head.appendChild(metaDescription);
  }

  return metaDescription;
}

function getOrCreateMeta(attributeName: "name" | "property", attributeValue: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${attributeName}="${attributeValue}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attributeName, attributeValue);
    document.head.appendChild(meta);
  }

  return meta;
}

function getOrCreateCanonicalLink() {
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }

  return canonical;
}

function removeMetadataElement(selector: string) {
  document.querySelector(selector)?.remove();
}

export function formatPageTitle(title?: string) {
  return title ? `${title} | ${siteTitle}` : siteTitle;
}

export function getAbsoluteUrl(pathOrUrl?: string) {
  if (!pathOrUrl) {
    return siteUrl;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${siteUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export function resolvePageMetadata(
  {
    canonicalPath,
    description,
    image,
    jsonLd,
    noindex = false,
    title,
    type = "website",
  }: PageMetadata,
  fallbackPath = "/",
): ResolvedPageMetadata {
  const formattedTitle = title?.includes("|") ? title : formatPageTitle(title);
  const resolvedDescription = description ?? defaultDescription;

  return {
    title: formattedTitle,
    description: resolvedDescription,
    canonicalUrl: getAbsoluteUrl(canonicalPath ?? fallbackPath),
    imageUrl: image ? getAbsoluteUrl(image) : undefined,
    noindex,
    type,
    jsonLd,
  };
}

export function usePageMetadata({
  canonicalPath,
  description,
  image,
  jsonLd,
  noindex = false,
  title,
  type = "website",
}: PageMetadata) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const resolvedMetadata = resolvePageMetadata(
      { canonicalPath, description, image, jsonLd, noindex, title, type },
      window.location.pathname,
    );
    const metaDescription = getMetaDescriptionElement();

    document.title = resolvedMetadata.title;
    metaDescription.content = resolvedMetadata.description;
    getOrCreateCanonicalLink().href = resolvedMetadata.canonicalUrl;
    getOrCreateMeta("property", "og:site_name").content = siteTitle;
    getOrCreateMeta("property", "og:title").content = resolvedMetadata.title;
    getOrCreateMeta("property", "og:description").content = resolvedMetadata.description;
    getOrCreateMeta("property", "og:url").content = resolvedMetadata.canonicalUrl;
    getOrCreateMeta("property", "og:type").content = resolvedMetadata.type;
    getOrCreateMeta("name", "twitter:card").content = resolvedMetadata.imageUrl ? "summary_large_image" : "summary";
    getOrCreateMeta("name", "twitter:title").content = resolvedMetadata.title;
    getOrCreateMeta("name", "twitter:description").content = resolvedMetadata.description;

    if (resolvedMetadata.imageUrl) {
      getOrCreateMeta("property", "og:image").content = resolvedMetadata.imageUrl;
      getOrCreateMeta("name", "twitter:image").content = resolvedMetadata.imageUrl;
    } else {
      removeMetadataElement('meta[property="og:image"]');
      removeMetadataElement('meta[name="twitter:image"]');
    }

    if (resolvedMetadata.noindex) {
      getOrCreateMeta("name", "robots").content = "noindex, nofollow";
    } else {
      removeMetadataElement('meta[name="robots"]');
    }

    removeMetadataElement('script[data-page-json-ld="true"]');

    if (resolvedMetadata.jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.pageJsonLd = "true";
      script.textContent = JSON.stringify(resolvedMetadata.jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = siteTitle;
      getMetaDescriptionElement().content = defaultDescription;
      removeMetadataElement('link[rel="canonical"]');
      removeMetadataElement('meta[property="og:site_name"]');
      removeMetadataElement('meta[property="og:title"]');
      removeMetadataElement('meta[property="og:description"]');
      removeMetadataElement('meta[property="og:url"]');
      removeMetadataElement('meta[property="og:type"]');
      removeMetadataElement('meta[property="og:image"]');
      removeMetadataElement('meta[name="twitter:card"]');
      removeMetadataElement('meta[name="twitter:title"]');
      removeMetadataElement('meta[name="twitter:description"]');
      removeMetadataElement('meta[name="twitter:image"]');
      removeMetadataElement('meta[name="robots"]');
      removeMetadataElement('script[data-page-json-ld="true"]');
    };
  }, [canonicalPath, description, image, jsonLd, noindex, title, type]);
}
