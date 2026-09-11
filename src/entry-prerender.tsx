import { renderToString } from "react-dom/server";
import App from "./App";
import { getPublishedBlogPostBySlug, getPublishedBlogPosts } from "./data/blogPosts";
import { getBlogIndexPageMetadata, getBlogPostPageMetadata } from "./lib/blogSeo";
import { resolvePageMetadata } from "./lib/pageMetadata";
import { BlogPage } from "./pages/BlogPage";
import { BlogPostPage } from "./pages/BlogPostPage";

function getPathname(path: string) {
  return new URL(path, "https://test4test.io").pathname.replace(/\/$/, "") || "/";
}

function getBlogRouteMetadata(path: string) {
  const pathname = getPathname(path);
  const blogPostMatch = /^\/blog\/([^/]+)$/.exec(pathname);

  if (!blogPostMatch) {
    return getBlogIndexPageMetadata();
  }

  return getBlogPostPageMetadata(getPublishedBlogPostBySlug(decodeURIComponent(blogPostMatch[1])));
}

export function getPrerenderBlogRoutes() {
  return ["/blog", ...getPublishedBlogPosts().map((post) => `/blog/${post.slug}`)];
}

export function renderBlogRoute(path: string) {
  const pathname = getPathname(path);
  const metadata = getBlogRouteMetadata(pathname);
  const appHtml = renderToString(
    <App prerenderPath={pathname} blogPages={{ index: BlogPage, post: BlogPostPage }} />,
  );

  return {
    appHtml,
    metadata: resolvePageMetadata(metadata, pathname),
  };
}
