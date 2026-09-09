import { equal, ok, rejects, throws } from "node:assert/strict";
import { discoverLogo, sanitizeSvg, validateLogo } from "./discovery.ts";
import { type FetchResource, type PageResource, MAX_BYTES } from "./network.ts";
import { verifiedSources } from "./sources.ts";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#123456"/></svg>';
const resource = (url: string, body: string, contentType = "text/html"): PageResource => ({
  url,
  bytes: new TextEncoder().encode(body),
  contentType,
});
function fixtureFetch(pages: Record<string, PageResource>) {
  const calls: string[] = [];
  const fetch: FetchResource = (url, signal) => {
    signal.throwIfAborted();
    calls.push(url);
    return pages[url] ? Promise.resolve(pages[url]) : Promise.reject(new Error("missing"));
  };
  return { fetch, calls };
}

Deno.test(
  "relative icons use final redirected URL and favor square high-resolution sources",
  async () => {
    const { fetch, calls } = fixtureFetch({
      "https://old.example/": resource(
        "https://new.example/app/",
        '<link rel="icon" href="small.svg" sizes="16x16"><link rel="apple-touch-icon" href="../brand.svg" sizes="180x180">',
      ),
      "https://new.example/brand.svg": resource(
        "https://new.example/brand.svg",
        svg,
        "image/svg+xml",
      ),
    });
    const logo = await discoverLogo("https://old.example/", new AbortController().signal, {
      fetch,
    });
    equal(logo?.sourceImageUrl, "https://new.example/brand.svg");
    equal(calls.length, 2);
  },
);

Deno.test("manifest icons resolve against the manifest URL", async () => {
  const { fetch } = fixtureFetch({
    "https://example.com/": resource(
      "https://example.com/",
      '<link rel="manifest" href="/app/manifest.json">',
    ),
    "https://example.com/app/manifest.json": resource(
      "https://example.com/app/manifest.json",
      JSON.stringify({ icons: [{ src: "icon.svg", sizes: "any" }] }),
      "application/manifest+json",
    ),
    "https://example.com/app/icon.svg": resource(
      "https://example.com/app/icon.svg",
      svg,
      "image/svg+xml",
    ),
  });
  equal(
    (await discoverLogo("https://example.com/", new AbortController().signal, { fetch }))
      ?.sourceImageUrl,
    "https://example.com/app/icon.svg",
  );
});

Deno.test("structured organization logo and conventional favicon fallbacks", async () => {
  for (const markup of [
    '<script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":{"url":"/logo.svg"}}]}</script>',
    '<link rel="icon" href="https://127.0.0.1/icon"><link rel="icon" href="/broken.png">',
  ]) {
    const { fetch, calls } = fixtureFetch({
      "https://example.com/": resource("https://example.com/", markup),
      "https://example.com/logo.svg": resource(
        "https://example.com/logo.svg",
        svg,
        "image/svg+xml",
      ),
      "https://example.com/broken.png": resource(
        "https://example.com/broken.png",
        "<html>Error</html>",
        "image/png",
      ),
      "https://example.com/favicon.ico": resource(
        "https://example.com/favicon.ico",
        svg,
        "image/svg+xml",
      ),
    });
    ok(await discoverLogo("https://example.com/", new AbortController().signal, { fetch }));
    ok(!calls.some((call) => call.includes("127.0.0.1")));
  }
});

Deno.test("store-only cards use app artwork, never the marketplace's favicon", async () => {
  for (const hostname of ["apps.apple.com", "play.google.com"]) {
    const url = `https://${hostname}/app`;
    const { fetch, calls } = fixtureFetch({
      [url]: resource(
        url,
        '<link rel="icon" href="/store.svg"><script type="application/ld+json">{"@type":"SoftwareApplication","image":"/app.svg"}</script>',
      ),
      [`https://${hostname}/app.svg`]: resource(
        `https://${hostname}/app.svg`,
        svg,
        "image/svg+xml",
      ),
    });
    ok(await discoverLogo(url, new AbortController().signal, { fetch, appStoreOnly: true }));
    ok(!calls.some((call) => call.includes("store.svg")));
    const blank = fixtureFetch({ [url]: resource(url, '<link rel="icon" href="/store.svg">') });
    equal(
      await discoverLogo(url, new AbortController().signal, {
        fetch: blank.fetch,
        appStoreOnly: true,
      }),
      null,
    );
    equal(blank.calls.length, 1);
  }
});

Deno.test("missing icons, failed overrides and aborted discovery fail gracefully", async () => {
  const { fetch } = fixtureFetch({
    "https://example.com/": resource("https://example.com/", "<html></html>"),
  });
  equal(
    await discoverLogo("https://example.com/", new AbortController().signal, {
      fetch,
      overrideUrl: "https://example.com/missing",
    }),
    null,
  );
  await rejects(() => discoverLogo("https://example.com/", AbortSignal.abort(), { fetch }));
});

Deno.test(
  "SVG sanitizer removes active content and external references but preserves Akari's gradient",
  () => {
    const clean = new TextDecoder().decode(
      sanitizeSvg(
        '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://evil.example/a"/><use href="#loop"/><style>@import url(https://evil.example)</style><defs><linearGradient id="g"><stop offset="0%" style="stop-color:#E8709A"/></linearGradient></defs><circle r="20" fill="url(#g)" onclick="alert(1)"/><path d="M0 0" fill="url(https://evil.example)"/><text>☆</text></svg>',
      ),
    );
    ok(!/script|onload|onclick|foreignObject|evil|<use|<image|<style/.test(clean));
    ok(clean.includes('stop-color="#E8709A"'));
    ok(clean.includes('fill="url(#g)"'));
    ok(clean.includes("☆"));
    throws(() =>
      sanitizeSvg(
        '<!DOCTYPE svg [<!ENTITY ext SYSTEM "file:///etc/passwd">]><svg><text>&ext;</text></svg>',
      ),
    );
    throws(() => sanitizeSvg("<html>Not an image</html>"));
    throws(() => validateLogo({ ...resource("https://example.com/a", "garbage", "image/png") }));
    throws(() =>
      validateLogo({
        url: "https://example.com/a",
        bytes: new Uint8Array(MAX_BYTES + 1),
        contentType: "image/png",
      }),
    );
  },
);

Deno.test(
  "all six curated sources have validated local assets and recorded provenance",
  async () => {
    const names = [
      "../../../../public/brand/test4test-mark.svg",
      "../../../../public/images/trusted-by/vidsyndicate.png",
      "../../../../public/images/trusted-by/pinch.png",
      "../../../../public/images/trusted-by/akari.svg",
      "../../../../public/images/trusted-by/mytinerary.png",
      "../../../../public/images/trusted-by/loventro.webp",
    ];
    equal(verifiedSources.length, 6);
    for (const [index, source] of verifiedSources.entries()) {
      // Resolve from this module's directory, three levels below the repository root.
      const file = new URL(names[index].replace("../../../../", "../../../"), import.meta.url);
      const bytes = await Deno.readFile(file);
      const asset = validateLogo({
        bytes,
        url: source.imageUrl,
        contentType: source.imageUrl.endsWith(".svg") ? "image/svg+xml" : "",
      });
      ok(asset.bytes.length > 0);
      ok(source.sourcePage.startsWith("https://"));
      ok(source.expectedDestination.startsWith("https://"));
    }
  },
);
