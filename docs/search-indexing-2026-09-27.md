# Search indexing investigation — September 27, 2026

## Search Console findings

The September 20 email, “New reasons prevent pages from being indexed on site
test4test.io,” concerns one URL: `http://test4test.io/` (last crawled September 19).
It correctly returns a permanent 301 redirect to `https://test4test.io/`. The HTTPS
homepage returns 200 and is already indexed. Keep this redirect. Google's
[Page indexing documentation](https://support.google.com/webmasters/answer/7440203#page_with_redirect)
explains that a redirecting alternate URL is normally excluded from the index.

The report also showed:

| Status                                   | URL                                                  | Finding                                                                                      |
| ---------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Alternate page with proper canonical tag | `https://test4test.io/blog/`                         | Canonical is `/blog`, but hosting redirected `/blog` back to `/blog/`.                       |
| Crawled, currently not indexed           | `https://test4test.io/?ref=producthunt`              | Tracking variant of the already indexed homepage; it does not need a separate search result. |
| Indexed                                  | `/`, `/blog`, `/get-paid-to-test`, `/test/test4test` | Four indexed pages in the report last updated September 20.                                  |

The public sitemap was available and declared in robots.txt, but no sitemap was
submitted in this Search Console property. Submitted
`https://test4test.io/sitemap.xml`; Google processed it successfully and discovered
all three listed URLs.

## Hosting correction

Set `assets.html_handling` to `drop-trailing-slash` in `wrangler.jsonc`.
Cloudflare's default adds slashes to prerendered folder indexes, conflicting with
the existing sitemap, internal links, and canonical tags. The explicit setting
serves the existing canonical URLs directly and redirects slash variants to them.
See [Cloudflare HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

This is a hosting configuration change with no interface, content, or data-contract
change. Existing uncommitted application work was excluded. Production files were
retained byte for byte: the upload reported no updated asset files, and all 162
public files passed SHA-256 comparisons after deployment. Runtime configuration
comparison confirmed that only `html_handling` changed.

Deployed at 100% on September 27:
`4428c9b7-0072-4b9e-b1e1-b99df3431851`.
Previous production version: `b36c9fbc-3223-45eb-980f-89faf23755ac`.

## Verification

**Fast-checked:** changed-file formatting and design-system invariants passed.
Local Cloudflare routing and 13 production HTTP cases passed, including:

- HTTP homepage → 301 to HTTPS; HTTPS homepage → 200.
- `/blog` and the published article URL → 200 with no redirect.
- Trailing-slash blog URLs → 307 to their existing canonical URLs.
- Query parameters preserved when removing a trailing slash.
- Sign-in, Earn, Buy Credits, tester landing, sitemap, and robots.txt → 200.

The rebuilt committed source was used only to verify the expected asset inventory;
production was deployed using the existing live files. No unrelated application
changes or rebuilt application bundles were published.

Local investigation evidence is in `.tmp/indexing-fix/`, including
`verification.json`, `production-manifest.json`, `baseline.json`,
`final-candidate.json`, and `sitemap-success.png`.

Google's index/report refresh is asynchronous. The HTTP redirect exclusion should
remain, and the trailing-slash blog URL may become a redirect exclusion after
recrawling. Neither alternate URL should be forced into the index. Do not use
“Validate fix” to try to remove the intentional HTTP-to-HTTPS redirect.

Rollback, if needed:

```powershell
npx wrangler versions deploy b36c9fbc-3223-45eb-980f-89faf23755ac@100 --yes
```
