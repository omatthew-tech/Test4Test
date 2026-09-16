# Compact mobile navigation

Implemented concept 1 in the shared `TopNavigation` design-system component. No deployment or visual-baseline updates.

The mobile header opens a content-height panel below the brand row. Primary links use semantic body typography, outline icons, and chevrons. Guest actions share equal columns. Member account links and sign out are available directly below a divider, retaining founder-only New app and My reviews destinations. Desktop navigation and the existing standalone `MobileNavigationDrawer` component retain their behavior.

The panel is a non-modal disclosure. It supports Enter/Space, ArrowDown entry, Escape with focus restoration, ordinary Tab order, outside-click and focus-leave dismissal, route dismissal, and reset at the existing desktop breakpoint. Long menus scroll within the viewport. Semantic tokens supply all new visual values; no exceptions were added.

## Screenshots

- `visitor-mobile.png`: guest menu at 390 × 844.
- `member-mobile.png`: founder menu on Earn at 390 × 844.
- `member-desktop.png`: unchanged desktop header at 1440 × 900.
- Also inspected 320-pixel reflow and tested a 390 × 400 short viewport.

## Verification

- Formatting, lint (existing warnings only), TypeScript, and design-system validation passed.
- All 159 unit tests passed, including 8 desktop/mobile sign-out cases.
- All 73 Storybook component tests passed.
- Targeted visitor, founder, tester, keyboard, dismissal, short-viewport, resize, and desktop profile journeys passed after fixing equal action widths and dismissing the existing first-visit platform dialog in the fixture.
- Storybook and production builds passed.
- Targeted navigation visual checks: 14 passed, 2 desktop snapshots differ from existing baselines. Both differences are the desktop width cap introduced by commit `e11d489` on September 10: the current 960px navigation row versus the baseline's wider row. This task does not change that cap. Mobile, tablet, laptop, and standalone drawer snapshots pass. Baselines were preserved.
- Full `npm run ds:check` completed its browser stage with 216 passing checks and 7 failures outside this change: homepage Trusted by contrast (3.23:1 versus 4.5:1 required), two old free-feedback heading expectations, an old managed-recruitment heading expectation, the old Analytics navigation label (the current label is Analyze), and two outdated recording-link expectations. All nine menu-specific journeys passed. The gate stopped before its full visual/build stages; the targeted visual checks and successful production build above were run separately. Homepage and Analytics page source files are unchanged by this task.
- Final `ds:check:fast` passed for all 13 changed source, contract, story, and test files.

Status: Fast-checked; not Release-validated.
