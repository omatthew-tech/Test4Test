import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getPublishedBlogPostBySlug, type BlogBlock, type BlogTextLink } from "../data/blogPosts";
import { formatCalendarDate, minutesLabel } from "../lib/format";
import { usePageMetadata } from "../lib/pageMetadata";
import { AppShell } from "../components/Layout";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function LinkedText({ links = [], text }: { links?: BlogTextLink[]; text: string }) {
  if (links.length === 0) {
    return <>{text}</>;
  }

  const linksByText = new Map(links.map((link) => [link.text, link]));
  const linkPattern = new RegExp(`(${links.map((link) => escapeRegExp(link.text)).join("|")})`, "g");

  return (
    <>
      {text.split(linkPattern).map((segment, index) => {
        const link = linksByText.get(segment);

        if (!link) {
          return segment;
        }

        return (
          <a key={`${segment}-${index}`} href={link.href} target="_blank" rel="noreferrer">
            {segment}
          </a>
        );
      })}
    </>
  );
}

function BlogBlockRenderer({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <LinkedText links={block.links} text={block.text} />
        </p>
      );
    case "heading":
      return block.level === 2 ? (
        <h2>
          <LinkedText links={block.links} text={block.text} />
        </h2>
      ) : (
        <h3>
          <LinkedText links={block.links} text={block.text} />
        </h3>
      );
    case "list":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote>
          <p>{block.text}</p>
          {block.attribution ? <cite>{block.attribution}</cite> : null}
        </blockquote>
      );
    case "callout":
      return (
        <aside className="blog-article-callout">
          {block.title ? <strong>{block.title}</strong> : null}
          <p>{block.text}</p>
        </aside>
      );
    case "image":
      return (
        <figure>
          <img src={block.image.src} alt={block.image.alt} loading="lazy" decoding="async" />
          {block.image.caption ? <figcaption>{block.image.caption}</figcaption> : null}
        </figure>
      );
  }
}

export function BlogPostPage() {
  const { slug } = useParams();
  const post = slug ? getPublishedBlogPostBySlug(slug) : null;

  usePageMetadata({
    title: post?.title ?? "Article not found",
    description: post?.excerpt ?? "The Test4Test article you are looking for could not be found.",
  });

  if (!post) {
    return (
      <AppShell variant="marketing">
        <div className="blog-page">
          <section className="blog-not-found" aria-labelledby="blog-not-found-title">
            <span className="eyebrow">Article unavailable</span>
            <h1 id="blog-not-found-title">That article is not published.</h1>
            <p>It may have moved, or it may still be a draft.</p>
            <Link to="/blog" className="button button--primary">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to blog
            </Link>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="marketing">
      <article className="blog-article">
        <Link to="/blog" className="blog-back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Blog
        </Link>

        <header className="blog-article__header">
          <div className="blog-meta">
            <time dateTime={post.publishedAt}>{formatCalendarDate(post.publishedAt)}</time>
            <span>{minutesLabel(post.readTimeMinutes)} read</span>
          </div>

          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
        </header>

        {post.coverImage ? (
          <figure className="blog-article__cover">
            <img src={post.coverImage.src} alt={post.coverImage.alt} loading="eager" decoding="async" />
            {post.coverImage.caption ? <figcaption>{post.coverImage.caption}</figcaption> : null}
          </figure>
        ) : null}

        <div className="blog-article__body">
          {post.body.map((block, index) => (
            <BlogBlockRenderer key={`${block.type}-${index}`} block={block} />
          ))}
        </div>

        <section className="blog-article-cta blog-article-cta--compact" aria-label="Try Test4Test">
          <a href="https://test4test.io" className="button button--primary">
            Try Test4Test Now -&gt;
          </a>
        </section>
      </article>
    </AppShell>
  );
}
