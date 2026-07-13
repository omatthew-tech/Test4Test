# MSB-74 AI Suggestion Relevance Test Results

## Test Area

AI-generated suggestions shown on individual report screenshot pages.

## Test Goal

Ensure each AI suggestion is relevant to the screenshot and the user's related quotes.

## Test Steps

1. Pulled the latest `group-3` branch from GitHub.
2. Started the project locally using `npm run dev`.
3. Logged in with the test account.
4. Opened Report 14 from the AI Analysis/report area.
5. Reviewed the screenshot pages one at a time.
6. Compared each AI suggestion against the visible screenshot and the quotes shown on that page.

## Result

Status: Needs Review / Partial Pass

The AI suggestions generally matched the quotes and user feedback shown on each page. However, I noticed that some quotes appear to carry over onto nearby screenshots where they do not fully belong. In several cases, the same quote appears on one screenshot where it seems less relevant, and then appears again on the next screenshot where it matches the screen better.

Because the AI suggestion appears to be based on the quote shown on the page, the suggestion can look less relevant when the quote itself is attached to the wrong screenshot. This means the AI suggestion logic seems mostly correct, but the quote-to-screenshot alignment may need review.

It also appears that AI suggestions do not show on every screenshot, which is not necessarily a problem. Some screenshots and quotes do not contain enough meaningful usability feedback, so it is better for the system to avoid creating a weak or generic suggestion instead of forcing one.

## Observations

- Screen 1 of 43 showed a quote about the home screen, but the screenshot was still on the recording/startup screen rather than the actual application page.
- The same home screen quote appeared again on Screen 2 of 43, where it matched the screenshot better.
- Screen 3 of 43 repeated the orange circle quote from the previous screen.
- Some quotes appear to remain visible for multiple screenshots, even when the screenshot has changed.
- Screen 23 of 43 showed a single generic "okay" quote, which did not provide meaningful usability feedback.
- AI suggestions do not appear on every screenshot, which seems acceptable when the quote or screenshot does not provide enough useful feedback.
- When the quote was properly matched to the screenshot, the AI suggestion generally made sense.

## Recommendation

Review the quote-to-screenshot matching logic before changing the AI suggestion generation. The AI suggestions appear to follow the quote/user feedback, but inaccurate quote placement can make the suggestions appear unrelated to the screenshot.

The current behavior of not forcing suggestions onto every screenshot should be kept, since some screenshots do not have enough useful feedback to support a meaningful AI suggestion.