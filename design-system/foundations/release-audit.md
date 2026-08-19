# Release audit

> Historical design-system 1.0 evidence (2026-07-23). The matrix records the v1 replacement state and does not override the [recording-first product specification](../../usability_platform_product_plan.md).

This matrix maps the replacement plan to enforceable repository evidence. The canonical
specification remains unchanged in `../specification.md`; this document records implementation
status without redefining it.

| Requirement                                      | Repository evidence                                                                                                                                        | Status                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Canonical authority and provenance               | `README.md`, `specification.md`, `provenance.json`, specification hash check in `scripts/validate-design-system.mjs`                                       | Implemented           |
| DTCG 2025.10 foundations                         | `tokens/source/tokens.json`, token JSON Schema, deterministic CSS/TypeScript generator, unit tests                                                         | Implemented           |
| Stable public UI surface                         | `index.ts`, exact source-export and deep-import checks in `ds:validate`                                                                                    | Implemented           |
| Versioned component contracts and catalog        | 50 catalog records, JSON Schema, generated contract and README per component                                                                               | Implemented           |
| Required component families and product patterns | Actions, forms, layout, navigation, feedback, overlays, data display, question editing, ratings, rows, response viewing, and recording status              | Implemented           |
| Component documentation and interaction coverage | Eight Storybook files, 69 interaction checks, exact size/variant/state coverage annotations enforced against all 50 catalog contracts, accessibility addon | Implemented           |
| Flat identity and self-hosted type               | Token-validated SVG mark/wordmark and manifest, generated favicon/social assets, byte-verified official Geist Variable and Geist Mono with license         | Implemented           |
| Whole-application adoption                       | Generated tokens/base styles plus CSS Modules across all public, authenticated, data, recording, account, admin, blog, success, and email-preview routes   | Implemented           |
| Semantic and keyboard conformance                | One route `h1`, labels/descriptions, live regions, focus containment/restoration, Escape behavior, target sizes, keyboard journeys                         | Automated checks pass |
| Responsive and user-preference conformance       | Every route at 320 px, 200% text, forced colors, and reduced motion                                                                                        | Automated checks pass |
| Visual gate                                      | Owner-approved foundations, identity, shell, Home, Submit Test, My Tests/data presentation, and recording language                                         | Approved 2026-07-23   |
| Visual regression                                | 352 comparisons at 390, 768, 1024, and 1440 CSS px                                                                                                         | Automated checks pass |
| Repository enforcement                           | `ds:validate`, `ds:a11y`, `ds:visual`, `ds:check`, Chromium CI, router coverage, static-brand token integrity, raw-value and exception checks              | Implemented           |
| Production-independent test states               | Development-only fixtures; Playwright rejects Supabase requests                                                                                            | Implemented           |
| Legacy retirement                                | Legacy stylesheet/document, glossy mascot components/assets, obsolete branding guide and old references removed                                            | Implemented           |
| Backend scope boundary                           | Existing Supabase transactional email HTML remains under the time-bound backend exception                                                                  | Explicit exception    |
| NVDA/Chrome review                               | Human evidence fields in `release-evidence.md`                                                                                                             | Pending human review  |
| VoiceOver/Safari review                          | Human macOS release check in `release-evidence.md`                                                                                                         | Pending human review  |

The internal design-system version is `1.0.0`. This repository does not publish a package, create a
Git tag, deploy, or modify production data as part of the replacement.
