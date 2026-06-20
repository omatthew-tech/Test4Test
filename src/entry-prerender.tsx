import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./context/AppStateContext";
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
  return [
    "/blog",
    ...getPublishedBlogPosts().map((post) => `/blog/${post.slug}`),
  ];
}

export function renderBlogRoute(path: string) {
  const pathname = getPathname(path);
  const metadata = getBlogRouteMetadata(pathname);
  const appHtml = renderToString(
    <MemoryRouter initialEntries={[pathname]}>
      <AppStateProvider>
        <Routes>
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      </AppStateProvider>
    </MemoryRouter>,
  );

  return {
    appHtml,
    metadata: resolvePageMetadata(metadata, pathname),
  };
}
