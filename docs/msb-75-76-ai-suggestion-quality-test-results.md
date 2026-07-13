# MSB-75 and MSB-76 AI Suggestion Quality Test Results

## Test Area

AI-generated suggestions shown on individual report screenshot pages.

## Test Goals

- MSB-75: Ensure every AI suggestion is no more than one sentence.
- MSB-76: Ensure AI suggestions are unique, specific, and not generic or repeated on the same page or across other pages.

## Test Steps

1. Pulled the latest `group-3` branch from GitHub.
2. Started the project locally using `npm run dev`.
3. Logged in with the test account.
4. Opened Report 14 from the AI Analysis/report area.
5. Reviewed screenshot pages one at a time.
6. Checked each visible AI suggestion for sentence length.
7. Compared suggestions across pages to look for repeated, generic, or duplicate wording.

## MSB-75 Result

Status: Pass

When AI suggestions appeared, they were no more than one sentence. I did not observe AI suggestions being split into multiple sentences or long paragraph-style recommendations.

## MSB-76 Result

Status: Needs Review / Partial Pass

The AI suggestions were not generic nonsense. When the quotes matched the screenshots correctly, the suggestions were usually relevant, specific, and useful.

However, some AI suggestions did repeat across nearby screenshots. In Report 14, I noticed repeated suggestions on Screen 2 and Screen 3, Screen 8 and Screen 9, and Screen 38 and Screen 39. This may be related to the quote-to-screenshot alignment issue, where the same or similar quote carries over between nearby screenshots.

## Observations

- AI suggestions were consistently short and stayed within one sentence.
- AI suggestions did not appear on every screenshot, which seems acceptable because some screenshots do not have enough meaningful feedback for a useful suggestion.
- The suggestions that did appear were generally relevant when the quote matched the screenshot.
- The repeated suggestions did not seem like random generic output, but they did repeat across some nearby screens.
- Repeated examples were observed on Screen 2 and Screen 3, Screen 8 and Screen 9, and Screen 38 and Screen 39 in Report 14.

## Recommendation

Keep the one-sentence suggestion behavior for MSB-75.

For MSB-76, review the suggestion deduplication logic and the quote-to-screenshot alignment. The suggestions are generally useful and not generic, but repeated suggestions across nearby screenshots should be reduced or grouped when they are based on the same underlying feedback.