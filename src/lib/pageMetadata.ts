import { useEffect } from "react";

const siteTitle = "Test4Test";
const defaultDescription =
  "Test4Test is a warm, fast usability testing platform where users earn feedback credits by testing other products.";

export interface PageMetadata {
  title?: string;
  description?: string;
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

export function formatPageTitle(title?: string) {
  return title ? `${title} | ${siteTitle}` : siteTitle;
}

export function usePageMetadata({ title, description }: PageMetadata) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const metaDescription = getMetaDescriptionElement();

    document.title = formatPageTitle(title);
    metaDescription.content = description ?? defaultDescription;

    return () => {
      document.title = siteTitle;
      getMetaDescriptionElement().content = defaultDescription;
    };
  }, [description, title]);
}
