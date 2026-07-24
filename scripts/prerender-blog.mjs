import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "vite";

const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const templatePath = join(distDir, "index.html");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildHeadTags(metadata) {
  const tags = [
    `<link rel="canonical" href="${escapeAttribute(metadata.canonicalUrl)}" />`,
    `<meta property="og:site_name" content="Test4Test" />`,
    `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(metadata.canonicalUrl)}" />`,
    `<meta property="og:type" content="${escapeAttribute(metadata.type)}" />`,
    `<meta name="twitter:card" content="${metadata.imageUrl ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`,
  ];

  if (metadata.imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeAttribute(metadata.imageUrl)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeAttribute(metadata.imageUrl)}" />`);
  }

  if (metadata.noindex) {
    tags.push('<meta name="robots" content="noindex, nofollow" />');
  }

  if (metadata.jsonLd) {
    tags.push(
      `<script type="application/ld+json" data-page-json-ld="true">${escapeJsonForHtml(metadata.jsonLd)}</script>`,
    );
  }

  return tags.map((tag) => `    ${tag}`).join("\n");
}

function injectPrerenderedRoute(template, route, renderedRoute) {
  const headTags = buildHeadTags(renderedRoute.metadata);

  if (!/<title>[\s\S]*?<\/title>/.test(template)) {
    throw new Error("Could not find the base <title> tag in dist/index.html.");
  }

  if (!/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s.test(template)) {
    throw new Error('Could not find the base meta name="description" tag in dist/index.html.');
  }

  if (!template.includes("</head>")) {
    throw new Error("Could not find the closing </head> tag in dist/index.html.");
  }

  if (!template.includes('<div id="root"></div>')) {
    throw new Error(
      'Could not find the empty <div id="root"></div> mount point in dist/index.html.',
    );
  }

  return template
    .replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>${escapeHtml(renderedRoute.metadata.title)}</title>`,
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
      `<meta name="description" content="${escapeAttribute(renderedRoute.metadata.description)}" />`,
    )
    .replace("</head>", `${headTags}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root" data-prerendered-route="${escapeAttribute(route)}">${renderedRoute.appHtml}</div>`,
    );
}

function getOutputPath(route) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  return join(distDir, cleanRoute, "index.html");
}

const vite = await createServer({
  appType: "custom",
  logLevel: "error",
  server: {
    middlewareMode: true,
  },
});

try {
  const template = readFileSync(templatePath, "utf8");
  const { getPrerenderBlogRoutes, renderBlogRoute } = await vite.ssrLoadModule(
    "/src/entry-prerender.tsx",
  );
  const routes = getPrerenderBlogRoutes();

  for (const route of routes) {
    const outputPath = getOutputPath(route);
    const renderedRoute = renderBlogRoute(route);
    const html = injectPrerenderedRoute(template, route, renderedRoute);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, html);
  }

  console.log(`Prerendered ${routes.length} blog route(s): ${routes.join(", ")}`);
} finally {
  await vite.close();
}
