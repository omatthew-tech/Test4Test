# Homepage brand logos

Public `POST get-home-trusted-logos` accepts `{ "submissionIds": ["uuid"] }` (at
most six IDs) and returns `{ "logos": [{ "submissionId": "uuid", "logoUrl": null }] }`.
Only IDs currently returned by `list_home_trusted_submissions` are eligible.
Unauthenticated callers can obtain image URLs; they cannot submit fetch URLs,
read cached destination metadata, or write to the image bucket.

The frontend renders cards immediately and loads images separately. Errors and
missing images become initials. The existing feed RPC is unchanged. Verified
sources in `sources.ts` override discovery only while the submission ID and its
normalized destination both match. Website redirects do not rename the card.

## Discovery and cache

- HTTPS is assumed for destinations without a scheme. Each redirect is validated.
  DNS answers must all be public; HTTP connects to the selected address directly,
  with the original Host header and TLS server name, preventing DNS rebinding.
  A pinned Undici socket connector preserves TLS SNI and certificate verification
  in Supabase's hosted runtime, whose `node:https` shim ignores `servername`.
- No cookies, credentials, compression, private addresses, custom ports, or HTTPS
  downgrade redirects. Three redirects, 2MB per resource, eight image candidates,
  and a 15-second discovery deadline bound network work.
- Parse declared icons, touch icons, manifests, and structured organization logos;
  use the root favicon last. Store-only URLs use structured app artwork, never
  the store favicon. Missing structured artwork falls back to initials.
- Sniff raster dimensions and formats. SVG is rebuilt from static elements and
  attributes, with no scripts, entities, external resources, CSS or animation.
- Successful results expire after seven days; missing/failed discovery retries
  after one day. A stale image remains visible during background refresh and
  transient failures. A changed source immediately invalidates the previous image.
- A service-only atomic SQL claim leases work for 45 seconds. Completion checks
  both the source key and claim token, so an older worker cannot overwrite a new
  destination. Images use content-addressed paths in public Storage.
- Logs contain event codes and submission IDs, not destination URLs, credentials,
  response bodies, or private test information.
- PlanFinansowy24 uses the verified artwork from its public Google Play listing;
  hosted requests do not consistently receive structured artwork on the listing.

## Validation

From the repository root:

```powershell
npm run test:home-logos:backend
npm test -- tests/unit/home-trusted-logo-cache.test.ts tests/unit/home-trusted-logos.test.ts
npm run ds:check:route -- home
```

The database tests execute the actual migration in isolated embedded Postgres
using minimal Supabase role/table scaffolding; they do not use production.
Backend tests use mocked requests and saved image fixtures, with network access
disabled. `deno.lock` pins the function's transitive dependencies.

Manual source verification (contacts public websites and refreshes local image
fixtures; never part of automated validation):

```powershell
npm exec --yes --package=deno@2.9.6 -- deno run --config supabase/functions/get-home-trusted-logos/deno.json --allow-net --allow-env --allow-read --allow-write=public/images/trusted-by supabase/functions/get-home-trusted-logos/verify-sources.ts
```

## Deployment

Deployment requires authorization. Apply the additive `home_trusted_logos`
migration, deploy this function with its `deno.json` import map and
`verify_jwt = false`, then call it with the current feed IDs to warm the cache
before deploying the frontend. It uses the existing `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` server secrets. No new
third-party service, account, scheduled job, or user-facing setting is needed.

Verify that the warm-up returns six usable image URLs (including Test4Test's local
path), re-run with an unrelated ID and expect 403, and check the function logs
for `home_logo_discovery` failures. Roll back the frontend independently; the
additive cache/function can remain without changing the existing homepage feed.
