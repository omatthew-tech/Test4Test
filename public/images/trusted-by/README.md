# Homepage brand image fixtures

Verified on 2026-09-08. These files are local snapshots for offline design-system
fixtures and visual review. Production discovery stores validated copies in the
`home-trusted-logos` Supabase bucket. Test4Test reuses `/brand/test4test-mark.svg`.

| File               | Source                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vidsyndicate.png` | https://vidsyndicate.com/favicon-32x32.png?v=20260806-2 (the submitted vidshare.us site redirects to VidSyndicate)                                                  |
| `pinch.png`        | The 192px favicon declared by https://www.pinch.marketing/, linked from the submitted video pricing prototype                                                       |
| `akari.svg`        | https://ai-akari.ai/favicon.svg, declared in the site's manifest; sanitized to static SVG                                                                           |
| `mytinerary.png`   | https://themytineraryapp.lovable.app/favicon.png                                                                                                                    |
| `loventro.webp`    | https://storage.googleapis.com/indie-hackers.appspot.com/product-avatars/loventro/200x200_loventro.webp, published on https://www.indiehackers.com/product/loventro |

Exact original image URLs, submission IDs, and expected destinations are versioned
in `supabase/functions/get-home-trusted-logos/sources.ts`. Product names remain
author-provided. Source logos retain their original brand colors.

`planfinansowy.png` was verified on 2026-09-18 against the icon in the public
[PlanFinansowy24 Google Play listing](https://play.google.com/store/apps/details?id=pl.planfinansowy24.mobile).
It is an offline verification fixture; the existing design-review fixture set is unchanged.
