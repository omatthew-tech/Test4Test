# Accessibility release evidence

> Historical design-system 1.0 evidence (2026-07-23). This file preserves the accepted v1 release record; it is not evidence that future recording-first interfaces have been implemented or validated.

## Automated evidence

Run date: 2026-07-23

- Storybook interaction and accessibility coverage: 69 tests across eight story files exercise all 50 catalog components plus representative and explicit public-navigation, toast-tone, and overlay states. Exact size, variant, and state annotations are validated against every catalog contract, and every contract story is required in visual regression.
- Route-level Playwright/Axe coverage: 97 checks cover 21 public, authenticated, data-heavy, recording, admin, email-preview, and fallback route states with zero automatically detectable WCAG A/AA violations.
- Responsive and preference coverage: every route is checked at 320 CSS px, 200% text enlargement, reduced motion, and forced colors.
- Keyboard interaction coverage: skip-link focus, mobile navigation, account deletion, edit/share/report dialogs, keyboard-operated choices, response navigation, recording-permission recovery, and admin confirmation.
- Visual coverage: 352 deterministic comparisons cover 67 component/pattern story states and 21 route states at 390, 768, 1024, and 1440 CSS px.
- External-state isolation: automated routes fail immediately if they attempt to contact Supabase.
- Visual gate: the design-system owner approved the foundations, identity, shell, Home, Submit Test, My Tests/data presentation, and Test Session recording language on 2026-07-23.

Reproduce with `npm run ds:a11y`, `npm run ds:visual`, or the aggregate `npm run ds:check`.

## Human release checklist

Release decision: Accepted by the design-system owner on 2026-07-23.

The owner confirmed in the Codex task that everything works and explicitly waived further manual keyboard-only, NVDA/Chrome, and VoiceOver/Safari execution. This records owner acceptance of the residual accessibility-review risk; it does not claim that new assistive-technology sessions were performed or that version-specific evidence was collected.

### Keyboard-only

- [x] Public navigation and sign-in accepted by the owner; further manual execution waived.
- [x] Submission validation and recovery accepted by the owner; further manual execution waived.
- [x] Dialog and drawer operation, dismissal, and focus restoration accepted by the owner; further manual execution waived.
- [x] Rating, test-session, recording-permission, upload, sharing, profile, and admin journeys accepted by the owner; further manual execution waived.

### NVDA with Chrome on Windows

- [x] Landmarks, heading hierarchy, labels, descriptions, errors, live regions, dialogs, tables, ratings, progress, and recording-state announcements accepted by the owner; further manual execution waived.
- Reviewer: Design-system owner (user)
- Date: 2026-07-23
- NVDA / Chrome versions: Not supplied; version-specific execution waived by the owner.
- Evidence or issue links: Owner confirmation in the Codex task; no issues reported.

### VoiceOver with Safari on macOS

- [x] The macOS release journeys were accepted by the owner; further manual execution waived.
- Reviewer: Design-system owner (user)
- Date: 2026-07-23
- VoiceOver / Safari versions: Not supplied; version-specific execution waived by the owner.
- Evidence or issue links: Owner confirmation in the Codex task; no issues reported.
