# Signed-in profile dropdown

Status: **Fast-checked**. Implementation is complete; the repository is not release-validated.

The desktop header uses a circular profile icon. Its menu contains Profile, a divider, New app,
My reviews, and a final separated Sign out action. New app and My reviews have moved out of
primary navigation. The same menu appears inside the mobile drawer; tester accounts receive
Profile and a separated Sign out action. Sign out has been removed from both Profile-page variants.

Opening the menu does not highlight Profile. Item backgrounds change only on hover, while
keyboard users retain the standard focus outline. Sign out preserves the existing account-specific
redirects, disables duplicate attempts while pending, and allows retrying after an error.

Reviewed at 1440 × 900 and 390 × 844:

- [Desktop screenshot](desktop.png)
- [Mobile screenshot](mobile.png)

## Validation

| Check | Result |
| --- | --- |
| Formatting, lint, TypeScript, design-system validation | Passed; repository lint retains 19 existing warnings |
| Unit tests | 65 passed, including 4 sign-out action tests |
| Storybook component tests | 71 passed |
| New profile-menu route tests | 8 passed, covering both viewports, hover-only backgrounds, destination routing, current-route selection, keyboard controls, outside dismissal, nested Escape, guest/tester behavior, and removal of Profile-page Sign out buttons |
| Complete route/accessibility suite | 174 passed; 3 existing homepage heading assertions failed |
| Previous visual comparisons | 319 passed; 28 missing baselines and 37 screenshot mismatches |
| Previous Menu and TopNavigation visual contracts | Passed at mobile, tablet, laptop, and desktop |
| Production build | Passed |

The homepage failures concern the free-feedback section headings at both viewports and the
managed-recruitment heading. Those page changes were already present before this task.
The broader visual failures include existing missing references and route differences; they
have not been accepted as replacement baselines. The 28 missing reference images automatically
written by Playwright were removed. No visual baseline changes remain.

Latest results: [sign-out release check](signout-release-check.log) and
[sign-out production build](signout-build-check.log). Both screenshots above show the latest menu.

Earlier dropdown validation: [release check](release-check.log), [visual check](visual-check.log),
and [production build](build-check.log). The earlier visual suite was completed with four workers
after building Storybook. Unrelated working changes were preserved.
