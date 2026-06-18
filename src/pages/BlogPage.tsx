import { Link } from "react-router-dom";
import { getPublishedBlogPosts, type BlogPost } from "../data/blogPosts";
import { formatCalendarDate, minutesLabel } from "../lib/format";
import { usePageMetadata } from "../lib/pageMetadata";
import { AppShell } from "../components/Layout";

function BlogPostCard({ post }: { post: BlogPost }) {
  const cardClassName = [
    "blog-card",
    post.coverImage ? "blog-card--with-cover" : "",
    post.previewImage ? "blog-card--with-preview-image" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      <Link to={`/blog/${post.slug}`} className="blog-card__link" aria-label={`Read ${post.title}`}>
        {post.coverImage ? (
          <div className="blog-card__cover">
            <img src={post.coverImage.src} alt={post.coverImage.alt} loading="lazy" decoding="async" />
          </div>
        ) : null}

        <div className="blog-card__body">
          <div className="blog-meta">
            <span>{formatCalendarDate(post.publishedAt)}</span>
            <span>{minutesLabel(post.readTimeMinutes)} read</span>
          </div>

          <h2>{post.title}</h2>

          {post.previewImage ? (
            <div className="blog-card__preview-image">
              <img src={post.previewImage.src} alt={post.previewImage.alt} loading="lazy" decoding="async" />
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

export function BlogPage() {
  const publishedPosts = getPublishedBlogPosts();
  const visiblePosts = publishedPosts.slice(0, 3);

  usePageMetadata({
    title: "Blog",
    description: "Usability testing tips and tricks for every day founders.",
  });

  return (
    <AppShell variant="marketing">
      <div className="blog-page">
        <section className="blog-hero" aria-labelledby="blog-hero-title">
          <div className="blog-hero__copy">
            <h1 id="blog-hero-title">
              <span className="blog-hero__brand">Test4Test</span>
              <span className="blog-hero__label"> blog</span>
            </h1>
            <p>Usability testing tips &amp; tricks for every day founders</p>
          </div>
        </section>

        {publishedPosts.length === 0 ? (
          <section className="blog-empty" aria-labelledby="blog-empty-title">
            <div className="blog-empty__copy">
              <span className="eyebrow">Coming soon</span>
              <h2 id="blog-empty-title">No articles have been published yet.</h2>
              <p>New Test4Test articles will appear here as soon as they are ready.</p>
            </div>
          </section>
        ) : (
          <section className="blog-articles" aria-label="Articles">
            <div className="blog-grid">
              {visiblePosts.map((post) => (
                <BlogPostCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
