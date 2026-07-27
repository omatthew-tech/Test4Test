import { getPublishedBlogPosts, type BlogPost } from "../data/blogPosts";
import { getAbsoluteUrl, type PageMetadata } from "./pageMetadata";

export function getPostSeoImage(post: BlogPost) {
  return post.ogImage ?? post.coverImage ?? post.previewImage ?? null;
}

export function getBlogPostCanonicalPath(post: BlogPost) {
  return post.canonicalPath ?? `/blog/${post.slug}`;
}

export function buildBlogPostingJsonLd(post: BlogPost) {
  const seoImage = getPostSeoImage(post);
  const canonicalPath = getBlogPostCanonicalPath(post);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription ?? post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    mainEntityOfPage: getAbsoluteUrl(canonicalPath),
    image: seoImage ? [getAbsoluteUrl(seoImage.src)] : undefined,
    author: {
      "@type": "Organization",
      name: "Test4Test",
      url: "https://test4test.io",
    },
    publisher: {
      "@type": "Organization",
      name: "Test4Test",
      url: "https://test4test.io",
      logo: {
        "@type": "ImageObject",
        url: getAbsoluteUrl("/branding/Test4Test%20Regular%20Logo.png"),
      },
    },
  };
}

export function getBlogIndexPageMetadata(posts = getPublishedBlogPosts()): PageMetadata {
  const firstPost = posts[0];

  return {
    title: "Blog",
    description: "User testing tips and tricks for anyone with a website or app.",
    canonicalPath: "/blog",
    image: firstPost?.previewImage?.src ?? firstPost?.coverImage?.src,
    type: "website",
  };
}

export function getBlogPostPageMetadata(post: BlogPost | null): PageMetadata {
  if (!post) {
    return {
      title: "Article not found",
      description: "The Test4Test article you are looking for could not be found.",
      noindex: true,
      type: "website",
    };
  }

  return {
    title: post.seoTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt,
    canonicalPath: getBlogPostCanonicalPath(post),
    image: getPostSeoImage(post)?.src,
    jsonLd: buildBlogPostingJsonLd(post),
    noindex: post.noindex,
    type: "article",
  };
}
