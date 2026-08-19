# Master parity audit and aesthetic backlog

> Historical v1 evidence (2026-07-23). This audit records visual and interaction parity work; it is not a current product requirement. The [recording-first product specification](../usability_platform_product_plan.md) governs behavior.

## Scope

This audit compares the `master` application at commit `c4c58a1` with the
`codex/design-system-redesign` implementation. The redesign remains the visual source of truth:
the master branch supplies the proven information hierarchy and interaction composition, while
`design-system/README.md`, its component contracts, and semantic tokens supply the new visual
language.

The parity pass covered all 21 registered application route states at the required mobile
(`390 × 844`) and desktop (`1440 × 900`) acceptance viewports. Static application hooks were also
cross-checked against the redesign styles so that a route cannot silently fall back to an
unstyled legacy class.

## Completed component parity

| Component or route family                           | Master-parity issue found                                                                                                                                          | Redesign resolution                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public and authenticated shells                     | Several page bodies still depended on removed master layout hooks.                                                                                                 | Restored responsive container, stack, header, navigation, section, and action-row composition with semantic design-system tokens.                                                                            |
| Sign in                                             | The heading and form card occupied separate viewport-centered rows, producing a very large empty gap.                                                              | Rebuilt the flow with `Container`, `PageHeader`, `Card`, `Stack`, `TextField`, `Alert`, and `Button`; heading, form, errors, and sign-up action now read as one responsive flow.                             |
| Email verification                                  | Shared the broken authentication shell and mixed custom controls with redesign controls.                                                                           | Moved it to the same canonical form shell, including accessible code input, resend action, loading labels, and alerts.                                                                                       |
| Submission success                                  | The success panel was vertically isolated by viewport-height grid rules.                                                                                           | Returned it to normal document flow, restored the earned-credit treatment, and made actions stack on mobile.                                                                                                 |
| Form controls and action rows                       | Legacy fields, radio cards, option pills, helper states, and sticky actions had lost spacing and state styles.                                                     | Restored focus, selected, disabled, warning, success, compact, and mobile layouts using semantic tokens.                                                                                                     |
| Google Play closed-test option                      | Used a bespoke checkbox and hover tooltip.                                                                                                                         | Replaced it with the canonical design-system `Checkbox` and persistent supporting description.                                                                                                               |
| Submit and question editor flows                    | Editor cards, duplicate controls, mode strips, option rows, review highlights, and recording settings were partially unstyled.                                     | Reintroduced the master hierarchy and responsive editor composition through the redesign token layer.                                                                                                        |
| Earn and visibility                                 | Filters, platform preferences, eligibility tags, ranking details, and tooltips lacked complete responsive styling.                                                 | Restored the control hierarchy, modal treatment, tags, private-placement states, and tooltip behavior; corrected a mobile tooltip that widened the document to 530px.                                        |
| Test session and recording                          | Resource cards, progress, report actions, recording guidance, microphone states, recovery uploads, and illustrations had incomplete parity.                        | Migrated the route to canonical actions, inputs, feedback, progress, choice, and dialog APIs. Desktop and phone setup now disclose one active step at a time, with concise readiness and upload summaries.   |
| Complex workflow controls                           | Test-session, edit-submission, and share-test workflows still used one-off buttons, fields, feedback markup, and custom focus-managed overlays.                    | Replaced those controls with design-system `Button`, field, choice, feedback, recording-status, and `Dialog` APIs; the generated picture-in-picture recorder remains an explicit browser-document exception. |
| Submissions and revision                            | Feedback cards, report states, revision questions, and resource links were visually incomplete. The revision subheader inherited a drawer-sized mobile flex basis. | Restored feedback/status components and report dialogs; removed the mobile dead space and returned revision content to normal flow.                                                                          |
| Results, versions, sharing, and tipping             | Aggregate rows, individual response identity, recording player, version dialogs, share preview, and tip states relied on missing hooks.                            | Restored data hierarchy, responsive actions, modal layouts, technical values, loading/empty states, and semantic status treatments.                                                                          |
| Profile and payments                                | The account row nested a padded card inside a padded surface, causing the email and actions to collapse on mobile.                                                 | Rebuilt the panel hierarchy, full-width mobile actions, email layout, payment feedback, save state, and danger section with semantic tokens.                                                                 |
| Credits, admin, and banned states                   | Balance labels, review/report decisions, confirmation areas, status badges, and restricted-account copy had incomplete styling.                                    | Restored the master information hierarchy and redesign status surfaces without introducing mock data.                                                                                                        |
| Blog, marketing, email preview, and fallback states | Hero copy, article previews, CTA/callout blocks, developer preview cards, and empty/not-found states had missing presentation hooks.                               | Restored responsive editorial and utility layouts while keeping the redesign typography, colors, radii, and spacing.                                                                                         |

## Remaining aesthetic opportunities

These items are usable and responsive after the parity pass, but they are the strongest candidates
for a future design iteration.

| Priority | Component                       | Current aesthetic limitation                                                                                      | Future improvement                                                                                                      |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| High     | Submission detail / results     | A full response set is a very long vertical scan, especially on mobile.                                           | Add sticky in-page section navigation and optional collapsible response groups while preserving direct keyboard access. |
| High     | Test session and revision forms | Long tests expose many cards at once; the sticky completion bar helps but does not reduce cognitive load.         | Add section-based progress and resumable groups after product rules define safe navigation between answers.             |
| Medium   | Earn platform preference dialog | The required modal interrupts the first view of the Earn page and contains a dense explanation above the choices. | Test a shorter explanation and, if product policy permits, a defer action or inline first-run preference panel.         |
| Medium   | Blog article                    | Long editorial pages have strong typography but limited wayfinding.                                               | Add a generated table of contents, reading progress, and anchored section links.                                        |
| Medium   | Email preview                   | This internal utility presents many full email cards in one long page.                                            | Add template filtering and a focused preview/detail mode; keep the current page as the printable overview.              |
| Low      | Admin empty state               | With no review work, the desktop page leaves a large quiet canvas.                                                | Add a compact, real-data activity summary only when reliable moderation metrics are available.                          |
| Low      | Profile payment methods         | Three equal text fields are clear but visually generic and do not communicate verification or availability.       | Add provider identity, validation, and verified/pending states when the payment model supports them.                    |

## Guardrails for follow-up work

- Continue importing reusable UI only from `@test4test/design-system`.
- Use semantic design-system tokens rather than raw visual values.
- Preserve a single `h1`, visible focus, keyboard operation, and reduced-motion behavior.
- Validate new layouts at `390 × 844` and `1440 × 900`.
- Do not fill visually quiet states with invented metrics or fake product data.
