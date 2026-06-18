import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const siteUrl = (process.env.SITE_URL || "https://test4test.io").replace(/\/$/, "");
const contentDir = join(process.cwd(), "content", "blog");
const publicDir = join(process.cwd(), "public");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCanonicalPath(post) {
  return post.canonicalPath || `/blog/${post.slug}`;
}

const posts = readdirSync(contentDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => JSON.parse(readFileSync(join(contentDir, fileName), "utf8")))
  .filter((post) => post.status === "published" && post.noindex !== true);

const urls = [
  {
    loc: `${siteUrl}/`,
    changefreq: "weekly",
    priority: "1.0",
  },
  {
    loc: `${siteUrl}/blog`,
    changefreq: "weekly",
    priority: "0.8",
  },
  ...posts.map((post) => ({
    loc: `${siteUrl}${getCanonicalPath(post)}`,
    lastmod: post.updatedAt || post.publishedAt,
    changefreq: "monthly",
    priority: "0.7",
  })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
${url.lastmod ? `    <lastmod>${escapeXml(url.lastmod)}</lastmod>\n` : ""}    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

try {
  writeFileSync(join(publicDir, "sitemap.xml"), sitemap);
  writeFileSync(join(publicDir, "robots.txt"), robots);
  console.log(`Generated sitemap.xml and robots.txt for ${posts.length} published blog post(s).`);
} catch (error) {
  if (error?.code !== "EPERM") {
    throw error;
  }

  console.warn(
    "Skipped writing sitemap.xml and robots.txt because this environment denied writes to public/. " +
      "The generator will run normally in build environments that allow public asset writes.",
  );
}
