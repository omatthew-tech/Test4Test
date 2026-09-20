# Recording feedback actions

The recording viewer places an optional 1–5 star rating below the current video on the left, with separate neutral Tip and Message pill buttons on the right. Controls wrap at narrow widths. Buttons and touch targets retain 44px hit targets; fine-pointer stars use 24px-wide targets around 20px icons, matching the selected tight-spacing mockup under the recording-star-pointer-density exception. The Rate video legend has a 12px trailing margin to balance its separation from the stars. Star hover previews have no background tile; keyboard focus remains visible. Historical revisions omit these actions; ratings apply to the current response.

`RatingControl` uses its `stars` variant, native radio keyboard behavior, and a visible group label beside the stars. Hovering previews a cumulative score without changing the selection. Clicking or using arrow keys selects a draft and reveals Submit beside the stars; only Submit saves it. Moving the pointer away restores the selected score. Successful submission keeps the stars filled, hides Submit, and announces success. Failed submissions retain the draft for retry. Load errors must be retried before changing an unknown rating. Existing legacy values display as frowny 1, neutral 3, and smiley 5.

Ratings persist in the existing `feedback_ratings` table using exact stars. The recording page no longer offers Clear rating. The earlier clearing migration is not required for this submit flow. See [star-ratings-rollout.md](star-ratings-rollout.md) for the conversion, reputation, revision, and report migration. No production database changes are made by the interface implementation.

Tip loads the tester profile on demand and offers supported PayPal, Venmo, or Cash App links. The user confirms the amount at the payment provider. When no supported link exists, an explicit Request payment link action uses the existing `send-tip-payment-method-request` endpoint. Message opens the private in-app conversation for that app and tester, creating it only on first send; see [in-app-chat.md](in-app-chat.md). Public recordings without a registered tester explain that contact details are unavailable.

Design-system fixtures keep ratings in memory and use fixture contact details. They do not call production media, Supabase, payment providers, or email APIs.

## Validation

- The hover-and-submit interaction is Fast-checked: seven targeted unit tests and both desktop/mobile browser journeys passed. Browser checks cover cumulative hover previews, retained selection, explicit submission, discarded unsent drafts, saved ratings across navigation, keyboard focus, accessibility, and 320px reflow. Submit remains beside the stars at 390px and 1440px with a minimum 44px target. No visual baselines were updated for this interaction change.

### Initial toolbar rollout

- Fast checks: formatting, lint, TypeScript, and design-system invariants passed.
- 238 unit tests and 73 Storybook tests passed, including rating persistence, safe payment links, and the new DELETE policy in local PGlite.
- Recording route accessibility passed, including 320px reflow, enlarged text, forced colors, and reduced motion. Desktop (1440 × 900) and mobile (390 × 844) screenshots were inspected; rating navigation, clearing, lazy contact loading, and dialog focus restoration passed.
- Updated only the approved recording-route and star-rating-story visual baselines.
- The full release gate reached 221 passing browser tests but stopped at 12 failures in existing home, Analytics, Earn, and microphone journeys. The older recording-navigation journey fails on its obsolete Analytics link label before reaching the viewer. The home contrast failure is the existing 0.65 opacity on Trusted by content. The full visual suite was therefore not reached; this change is Fast-checked, not Release-validated.
