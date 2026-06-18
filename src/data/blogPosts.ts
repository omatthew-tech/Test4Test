export type BlogPostStatus = "draft" | "published";
export type BlogAudience = "Founders" | "Testers" | "Everyone";

export interface BlogImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface BlogTextLink {
  text: string;
  href: string;
}

export type BlogBlock =
  | {
      type: "paragraph";
      text: string;
      links?: BlogTextLink[];
    }
  | {
      type: "heading";
      level: 2 | 3;
      text: string;
      links?: BlogTextLink[];
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "quote";
      text: string;
      attribution?: string;
    }
  | {
      type: "callout";
      title?: string;
      text: string;
    }
  | {
      type: "image";
      image: BlogImage;
    };

export interface BlogSeo {
  seoTitle?: string;
  metaDescription: string;
  canonicalPath?: string;
  noindex?: boolean;
  ogImage?: BlogImage;
}

export interface BlogPost extends BlogSeo {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  audience?: BlogAudience;
  tags?: string[];
  readTimeMinutes: number;
  previewImage?: BlogImage;
  coverImage?: BlogImage;
  status: BlogPostStatus;
  featured?: boolean;
  body: BlogBlock[];
}

const blogPostModules = import.meta.glob<BlogPost>("../../content/blog/*.json", {
  eager: true,
  import: "default",
});

export const blogPosts: BlogPost[] = Object.values(blogPostModules);

function comparePostsByPublishedDate(first: BlogPost, second: BlogPost) {
  return new Date(second.publishedAt).getTime() - new Date(first.publishedAt).getTime();
}

export function getPublishedBlogPosts() {
  return blogPosts
    .filter((post) => post.status === "published" && !post.noindex)
    .sort(comparePostsByPublishedDate);
}

export function getFeaturedBlogPost(posts = getPublishedBlogPosts()) {
  return posts.find((post) => post.featured) ?? posts[0] ?? null;
}

export function getLatestBlogPosts(posts = getPublishedBlogPosts()) {
  const featuredPost = getFeaturedBlogPost(posts);

  return featuredPost ? posts.filter((post) => post.slug !== featuredPost.slug) : posts;
}

export function getPublishedBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug && post.status === "published" && !post.noindex) ?? null;
}
