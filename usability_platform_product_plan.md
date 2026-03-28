# Usability Platform Product Plan

## 1. Product vision
Build a simple, trustworthy usability testing platform where users can submit a website or app, earn credits by testing other products, and spend those credits to get feedback on their own.

The product should feel:
- Easy to understand in under a minute
- Fast to use with low friction
- Fair in how credits are earned and spent
- High quality in the feedback it collects
- Safe from spam, low-effort responses, and abuse

Core value proposition:
**Test other products. Earn credits. Get feedback on yours.**

---

## 2. Primary MVP outcome
A new user should be able to:
1. Land on the homepage
2. Submit a website or app for testing in a short multi-step flow
3. Choose the question method: general, AI-generated, or custom
4. Verify their email with OTP
5. Start with 1 credit automatically
6. Be taken directly to the Earn page
7. Test another user’s product
8. Submit a completed test and earn 1 credit
9. View incoming test results for their own submission in My Tests
10. Rate the quality of feedback they receive
11. Receive an email when new feedback arrives

This should work cleanly on desktop first, and remain usable on mobile.

---

## 3. UX principles
### Simplicity first
Every screen should have one primary action and minimal distraction.

### Progress visibility
The user should always know where they are in a flow and what happens next.

### Fast time to value
A user should be able to submit their product before full account creation, then verify their email only when needed to monitor results and continue.

### Fair exchange
The platform should constantly reinforce that users earn feedback by giving feedback.

### Feedback quality over volume
The product should discourage rushed answers and reward thoughtful responses.

### Anonymity with accountability
Responses should be anonymous to submitters by default, while the platform still tracks internal user identity for moderation, quality review, and bans.

---

## 4. Core information architecture
Top-level product areas:
- Home
- Submit flow
- Email verification
- Earn
- Test session
- Test submitted confirmation
- My Tests
- Individual result detail
- Feedback rating
- Account/Profile
- Admin/Moderation

Navigation for signed-in users:
- Earn
- My Tests
- Submit
- Profile

Optional later:
- Credits
- Notifications
- Settings

---

## 5. Primary user roles
### Submitter
A user who submits a website or app and wants feedback.

### Tester
A user who completes tests on other products to earn credits.

### Moderator/Admin
Internal role for abuse review, credit adjustments, test quality review, and bans.

Most users will be both submitter and tester.

---

## 6. End-to-end user flow
## Flow A: Submit a product
1. User lands on homepage
2. Homepage asks for the name of their app or website
3. User continues to next step
4. User chooses product type:
   - Website / Web app
   - Mobile app
5. User provides the product access details
6. User chooses question source:
   - General questions
   - AI-generated questions
   - Custom questions
7. System creates the test listing
8. User sees success state
9. User is prompted to sign up with email to monitor progress
10. User verifies email via OTP
11. User account is created or linked
12. User receives 1 starter credit
13. User is taken to Earn page

## Flow B: Earn by testing
1. User lands on Earn page
2. User sees available tests
3. User selects a product to test
4. Product opens in a new tab
5. The testing page stays open and displays the required question set
6. User answers all questions
7. User submits the test
8. User sees success page showing 1 credit earned
9. User clicks button to return to Earn page

## Flow C: Review results
1. User opens My Tests
2. User sees all submitted products
3. User sees status, number of responses, and summary overview
4. User clicks into a specific submission
5. User sees charts, response breakdowns, and individual test entries
6. User can open a single test response for full detail
7. User can rate the helpfulness/quality of that feedback using a face rating

## Flow D: New feedback notification
1. A tester submits an approved response
2. The platform stores the response and awards credit
3. The submitter receives an email notification
4. The email tells them their website or app has been tested and feedback is ready to view
5. The email links the user to My Tests / result detail

---

## 7. Homepage requirements
Purpose: convert visitors into starting a submission immediately.

### Main interaction
The homepage should have a clear input asking for the product name.

Suggested field label:
- What’s the name of your app or website?

Suggested CTA:
- Submit for testing

### Homepage content blocks
- Simple hero headline
- One-line explanation of the credit system
- Product-name input field
- CTA button
- 3-step “How it works” section
- Trust / quality messaging
- Secondary CTA

### Important behavior
Typing the product name should begin the submission flow immediately without forcing full signup first.

### Credit message to communicate clearly
New users start with **1 credit** and can earn more by testing other products.

---

## 8. Submission flow requirements
This should be a short wizard with progress steps.

Recommended stepper:
1. Product name
2. Product type
3. Product access
4. Questions
5. Review
6. Success + email signup

### Step 1: Product name
Fields:
- Product name (required)

### Step 2: Product type
Options:
- Website / Web app
- Mobile app

### Step 3: Product access details
#### If Website / Web app
Fields:
- URL (required)
- Optional short description
- Optional instructions for testers
- Optional target audience

#### If Mobile app
Fields:
- Access method (required):
  - App Store link
  - Google Play link
  - TestFlight link
  - Public prototype link
  - External demo link
- Optional short description
- Optional instructions for testers
- Optional target audience

### Product access rule
A submission must be live and accessible before it can be published for testing. There will be no screenshot-upload-only option in the initial product.

If the link is broken, private, blocked, or otherwise inaccessible, the submission should be flagged and prevented from going live.

---

## 9. Question source options
The user must choose one of three modes.

### Option A: General questions
Use a reusable library of general UX questions that can apply to almost any website or app.

Goal:
Fastest path for most users.

Recommended default question count for MVP:
- 8 total questions
- 5 multiple choice
- 3 paragraph

That stays close to the requested ratio and is manageable for testers.

#### Example general multiple-choice questions
- How easy was it to understand what this product does?
- How easy was it to navigate the experience?
- How visually clear and organized did the interface feel?
- How confident would you feel using this product again?
- How likely would you be to recommend this product to someone else?

#### Example general paragraph questions
- What was the most confusing part of the experience?
- What is one thing you would improve first?
- What stood out as especially clear or effective?

### Option B: AI-generated questions
Use OpenAI to generate UX questions based on the submitted product.

Goal:
Create more tailored, product-aware usability questions.

#### AI generation inputs
For websites/web apps, send:
- Product name
- URL
- Product description
- Target audience
- Tester instructions
- Any available page preview or fetched metadata if implemented

For mobile apps, send:
- Product name
- Store/TestFlight/prototype/demo link
- Description
- Target audience
- Tester instructions

#### AI generation output requirements
- Generate 8 to 10 UX-focused questions
- Around 60% multiple choice
- Around 40% paragraph
- Questions must be specific to the product’s purpose and flow
- Avoid generic filler questions unless necessary
- Keep language simple
- Focus on clarity, trust, usability, friction, visual hierarchy, and task completion

#### Engineering requirement
The AI output should be structured JSON with:
- question title
- question type
- answer options if multiple choice
- display order
- optional rationale field for internal logging only

#### Safety/quality rules for AI-generated questions
- No sensitive or invasive questions
- No legal, medical, or financial advice framing
- No assumptions that the user completed payment or shared personal data
- Reject outputs with duplicate questions
- Allow the submitter to review and edit AI-generated questions before publishing

### Option C: Custom questions
Let the user define their own questions.

#### Fields per custom question
- Question title
- Answer type
  - Multiple choice
  - Paragraph

#### If multiple choice is selected
Allow:
- 2 to 6 answer options

#### Custom question rules
- Minimum 5 questions
- Maximum 10 questions for MVP
- At least 2 paragraph questions recommended
- Clear warning if the test will take too long
- Live preview of the final questionnaire

### Post-publish editing rule
Submitters should be able to edit questions after publishing.

To keep response data clean, apply these rules:
- Editing should affect future test sessions only
- Existing completed responses should remain attached to the version of the question set they answered
- Major edits should create a new question set version internally
- Admin/moderation should be able to inspect question history if needed

### Recommendation for product behavior
The system should recommend General questions as the default option, AI-generated as the smart option, and Custom questions as the advanced option.

---

## 10. Review and submission step
Before final submission, show a review screen with:
- Product name
- Product type
- Access link
- Short description
- Question mode selected
- Final question list

CTA:
- Submit my product

After submission, show:
- Success message
- “Your app has been submitted” state
- Prompt to sign up with email to monitor progress

---

## 11. Authentication requirements
Authentication should happen after product submission, not before.

### Signup requirement
Prompt the user to enter email to:
- Monitor the progress of their submitted product
- Earn credits
- View results in My Tests

### Authentication method
Use email OTP.

### OTP flow
1. User enters email
2. System sends one-time passcode
3. User enters code
4. If successful, user account is created or linked
5. User is signed in
6. User receives 1 starter credit if this is their first account creation
7. User is taken to Earn page

### Requirements
- OTP expiry window
- Rate limiting
- Resend code flow
- Clear error states
- Prevent duplicate ghost accounts where possible

---

## 12. Earn page requirements
Purpose: help users find and complete available tests to earn credits.

### Core UI
Show a list of available products to test.

Each card should include:
- Product name
- Product type
- Short description
- Estimated time
- Credit reward
- Question mode badge
- Possibly category / audience tags

### Sorting and filtering
For MVP:
- Recommended / best fit
- Newest
- Web vs Mobile
- Shortest estimated time

Optional later:
- Category
- Difficulty
- Credits needed by urgency

### Important behavior
When a user chooses a product to test:
- The product link opens in a new tab
- The platform remains open in the current tab on the test questionnaire page

That setup reduces friction because the tester can view the product and complete answers side by side.

---

## 13. Test session page requirements
This page must show both instruction and accountability clearly.

### Layout
Left or top area:
- Product info
- Open product button
- Testing instructions
- Quality warning

Main area:
- Question list
- Submit button

### Required messaging
Show a clear note such as:
**Please provide thoughtful, honest, high-quality answers. Low-effort or spam responses may result in warnings, credit loss, or account bans.**

### Validation rules
- All required questions must be answered
- Multiple choice must have a selection
- Paragraph responses should have minimum character counts where appropriate
- Submit button remains disabled until requirements are met, or validation appears inline

### Suggested quality controls
- Minimum paragraph length for open-text responses, e.g. 80–120 characters on key questions
- Detect repeated duplicate text across paragraph answers
- Detect copy-paste spam patterns
- Soft warning before final submit if responses appear low effort
- Internal quality score for moderation review

### Progress guidance
- Show question count completed
- Save draft locally or autosave if possible

---

## 14. Test submission success page
After a user submits a completed test, show a confirmation screen.

### Required content
- Success message
- Confirmation that the test was submitted
- Confirmation that the user earned 1 credit
- Button to return to Earn page

Suggested primary CTA:
- Back to Earn

Optional secondary CTA:
- View my credits

---

## 15. Credit system rules
### MVP rules
- New users start with 1 credit after first successful email verification
- Each completed approved test earns 1 credit
- Submissions should remain open to receive as many tests as possible by default

### Basic credit logic
- A user spends credits to receive tests on their own submission
- A user earns credits by completing tests for others
- Credits should only be awarded after successful submission and passing minimum quality checks
- New-user starter credit should appear in the credit ledger as a separate transaction type

### Submission distribution rule
Each submission should be configured by default to receive as many tests as possible, rather than stopping at a low fixed target.

For MVP, this means:
- A live submission can continue collecting responses while it remains active
- The system should still prioritize submissions with fewer responses first when distributing testing opportunities
- Users may later pause or close a submission, but the default state is open for more feedback

### Anti-abuse rules
- No credits for incomplete tests
- No credits for rejected spam responses
- Credits can be revoked by moderation
- Suspicious users can be rate limited, warned, or banned

### Recommendation for launch simplicity
Use a flat system first:
- 1 approved completed test = 1 credit
- 1 starter credit on signup
- Active submissions can keep receiving responses unless manually paused or closed

---

## 16. My Tests page requirements
Purpose: give submitters a simple, useful view of the feedback they’ve received.

### My Tests list view
For each submitted product show:
- Product name
- Product type
- Status
- Number of completed tests
- Credits spent / remaining if relevant
- Date submitted
- Button to view results

### Result detail view
When a user clicks a specific submission, show:
- Product summary
- Number of responses
- Completion trend if useful
- Overview summary
- Individual response list

### Recommended summary design
Keep this simple and effective.

#### Top summary block
- Total tests received
- Average rating for each multiple-choice question
- Most common choice per multiple-choice question
- Key themes from paragraph feedback
- Feedback quality reaction summary if enough ratings exist

#### Recommended visual summary
For multiple choice:
- Horizontal bars or percentage breakdowns
- Average score if the scale allows it

For paragraph responses:
- Group into lightweight themes such as:
  - Most praised
  - Most confusing
  - Most requested improvement

For submitter ratings of feedback quality:
- Count of smiley / neutral / frowny reactions
- Simple percentage breakdown if volume is high enough to be meaningful

### Important rule
The summary should help the user understand patterns quickly, but should never hide individual feedback. Raw responses must remain accessible.

### Individual response view
Each response should show:
- Anonymous tester label, e.g. “Tester 14”
- Submission date
- All answers in order
- Feedback rating control for the submitter
- Quality status if needed internally only

### Feedback rating system
After viewing a piece of feedback, the submitter should be able to rate its quality using:
- Frowny face
- Neutral face
- Smiley face

#### Rating goals
- Help identify useful vs low-value feedback
- Create a signal for moderation and future reputation systems
- Give the platform insight into response quality trends

#### Rating rules
- One rating per response by the submission owner
- Ratings can be updated by the submission owner if needed
- Ratings are anonymous to the tester in MVP unless product strategy changes later
- Ratings should not affect the visible anonymity of the tester

Optional later:
- Mark as helpful
- Save/share/export

---

## 17. Overview summary logic
For the overview summary, keep the UI simple and genuinely useful.

Recommended summary modules:
1. Total responses received
2. Average ratings by question
3. Response distribution by answer option
4. Top three recurring positive themes
5. Top three recurring friction themes
6. Suggested top priority improvement
7. Overall submitter reaction to feedback quality

### How to generate qualitative summaries
For MVP, use simple internal summarization on grouped text responses. Later this can be improved with AI summarization.

### Important guardrail
Always let the user inspect the underlying responses behind any summary.

---

## 18. Designer requirements
The designer should create:
- Homepage
- Submit wizard
- Review step
- Success + email signup state
- OTP verification screen
- Earn page
- Test session page
- Test submitted success page
- My Tests list
- My Tests detail view
- Feedback rating UI using frowny / neutral / smiley faces
- Empty states
- Error states
- Loading states
- Admin review state placeholder
- New feedback email template

### UX priorities for design
- One clear CTA per page
- Strong progress indicators in flows
- Minimal cognitive load
- Easy side-by-side testing experience
- Clear trust and quality messaging
- Clean charts and summaries, not dashboard clutter
- Very clear anonymous-feedback presentation so users understand they are rating the feedback, not the person

### Responsive behavior
Desktop-first for full testing flow, but mobile should remain functional for:
- Submission
- OTP verification
- Basic testing
- My Tests review

---

## 19. Engineering architecture recommendation
### Frontend
Use a modern app framework suitable for a fast multi-step product flow, authenticated dashboard pages, and responsive UI.

Recommended capabilities:
- Server-side rendering for landing pages where helpful
- Strong form handling and validation
- Simple state management for submission wizard and test sessions
- Reusable component system

### Backend
Backend should support:
- Auth via email OTP
- Product submissions
- Question generation and storage
- Question versioning for post-publish edits
- Test assignment and completion tracking
- Credits ledger
- Feedback storage
- Feedback rating storage
- Moderation workflows
- Summary generation
- Email notifications
- Notifications later

### Database
Use a relational database because the platform has structured relationships between users, submissions, questions, responses, credits, ratings, and moderation.

### File storage
Not required for screenshot uploads in the initial version, since submissions must be live and screenshots are not part of MVP input.

---

## 20. Suggested data model
Core entities:
- User
- Submission
- SubmissionAccess
- QuestionSet
- QuestionSetVersion
- Question
- QuestionOption
- TestAssignment or TestOpportunity
- TestResponse
- TestAnswer
- FeedbackRating
- CreditTransaction
- ModerationAction
- OTPChallenge
- EmailNotificationLog

### Example conceptual relationships
- A User has many Submissions
- A Submission has one active QuestionSetVersion at a time
- A QuestionSetVersion has many Questions
- A User completes many TestResponses
- A TestResponse belongs to one Submission
- A TestResponse has many TestAnswers
- A TestResponse can have one FeedbackRating from the submission owner
- A User has many CreditTransactions

### Important fields to include
#### User
- id
- email
- status
- created_at
- ban_status

#### Submission
- id
- user_id
- product_name
- product_type
- description
- target_audience
- instructions
- access_url
- status
- question_mode
- is_open_for_more_tests
- created_at

#### QuestionSetVersion
- id
- submission_id
- version_number
- created_at
- is_active

#### Question
- id
- question_set_version_id
- title
- type
- required
- sort_order

#### QuestionOption
- id
- question_id
- label
- value
- sort_order

#### TestResponse
- id
- submission_id
- tester_user_id
- question_set_version_id
- anonymous_label
- status
- quality_score
- credit_awarded
- submitted_at

#### TestAnswer
- id
- test_response_id
- question_id
- selected_option or text_answer

#### FeedbackRating
- id
- test_response_id
- rated_by_user_id
- rating_value
- created_at
- updated_at

#### CreditTransaction
- id
- user_id
- type
- amount
- reason
- related_test_response_id
- created_at

#### EmailNotificationLog
- id
- user_id
- submission_id
- notification_type
- delivered_at
- status

---

## 21. AI integration requirements
Use OpenAI for AI-generated question creation.

### AI question generation flow
1. Collect submission metadata
2. Build a structured prompt instructing the model to generate UX-focused questions
3. Request JSON output only
4. Validate the output server-side
5. Let the user review/edit before publishing

### AI prompt goals
The model should:
- Understand what the product appears to do
- Tailor questions to likely user tasks and first impressions
- Mix multiple-choice and paragraph questions
- Keep question count manageable
- Avoid jargon

### AI-generated question constraints
- 8 to 10 total questions
- 60/40 mix of multiple choice and paragraph
- Questions must be concise
- Multiple choice should use 4 to 5 options max
- Paragraph prompts should ask for useful reflection, not broad essays

### Validation layer
Never trust raw model output directly. Validate:
- JSON schema
- Allowed question types
- No duplicates
- No empty options
- No overlong questions

---

## 22. Matching and distribution logic
For MVP, keep assignment simple.

### Eligibility rules
A user can test any live submission except:
- Their own submission
- A submission they already completed
- Submissions that are closed, paused, or inaccessible

### Suggested prioritization
Surface tests based on:
- Fewest responses first
- Newest submissions second
- Shortest estimated completion time
- Product type compatibility if needed

This helps distribute feedback more evenly while still allowing submissions to continue receiving as many responses as possible by default.

---

## 23. Moderation and trust system
A usability feedback platform will fail quickly if low-quality answers flood the system. This is a core product area, not a side feature.

### Moderation tools needed
- Flag response for review
- Reject response
- Revoke credit
- Warn user
- Suspend user
- Ban user

### Auto-signals for review
- Very short paragraph answers
- Repeated identical answers across tests
- Submission speed far below expected reading time
- High rejection rate from past activity
- High rate of frowny ratings from submission owners

### User-facing trust messaging
The platform should clearly say that high-quality responses are required and abusive behavior may lead to bans.

---

## 24. Notifications and status
For MVP, support basic status communication.

Useful user states:
- Submission created
- Email verified
- Starter credit awarded
- Credits earned
- New feedback received
- Submission paused due to access issue
- Account warned or action required

### Email notifications required for MVP
#### OTP delivery email
Send an email containing the one-time passcode.

#### New feedback email
When a user receives a new approved test response on one of their submissions, send an email telling them:
- Their website or app has been tested
- New feedback is available
- They can now sign in and view the feedback

The email should include a direct link to the relevant result detail page where possible.

#### Optional later emails
- Submission reached a milestone number of tests
- Credits running low
- Warning / moderation notice

---

## 25. Analytics and product metrics
Track:
- Submission start rate
- Submission completion rate
- OTP verification completion rate
- Earn page click-through rate
- Test completion rate
- Average test completion time
- Approval/rejection rate of responses
- Credits earned vs spent
- Time to first feedback
- Average number of tests per submission
- Feedback rating distribution
- Percentage of responses rated smiley / neutral / frowny

These metrics will show whether the product loop is healthy.

---

## 26. MVP scope
### Must-have in MVP
- Homepage with submission entry
- Multi-step submission wizard
- Product type selection
- General / AI / Custom question modes
- Review step
- Email OTP auth
- 1 starter credit for new users
- Live-link-only submission requirement
- Question editing after publishing with versioning
- Earn page
- Test session page with new-tab product opening
- Required-answer validation
- Credit reward on successful approved submission
- My Tests list and detail view
- Overview summaries for responses
- Anonymous responses by default
- Feedback rating system using frowny / neutral / smiley faces
- Email notification when new feedback is received
- Basic moderation and quality checks

### Nice-to-have but not required for MVP
- Tester reputation scores
- AI summaries of all responses
- Comment threading
- Exports
- Team accounts
- Real-time notifications
- Advanced matching

---

## 27. Post-MVP roadmap
### Phase 2
- Better matching and skill-based assignment
- AI summaries of open-ended feedback
- Paid credit top-ups
- Saved tester profiles or internal reputation
- More detailed analytics and trends
- Better response-quality scoring using feedback ratings

### Phase 3
- Team workspaces
- Video / screen recording add-ons
- Session replay integrations
- Benchmarking across submissions
- Reviewer calibration / quality scoring system

---

## 28. Delivery plan for developer and designer
### Phase 1: Product definition and flows
- Finalize user stories
- Confirm credit rules
- Confirm moderation rules
- Finalize question schemas
- Confirm live-access requirements for web and mobile submissions
- Define notification copy and triggers
- Define feedback rating rules

### Phase 2: UX and visual design
- Wireframes for all core screens
- Clickable prototype of submit flow, earn flow, and my tests flow
- Design system and components
- Rating interaction states
- Error, loading, and empty states
- Email templates

### Phase 3: Backend and data model
- Auth and OTP
- Submission models
- Question generation service
- Question versioning system
- Test response and credits ledger
- Feedback rating storage
- Moderation tools
- Email notification service

### Phase 4: Frontend implementation
- Landing page
- Wizard flow
- Earn and test flow
- My Tests dashboard
- Summary views
- Feedback rating controls

### Phase 5: QA and launch readiness
- Broken-link handling
- Duplicate testing prevention
- Validation coverage
- Spam and abuse tests
- Email delivery testing
- Accessibility review
- Analytics verification

---

## 29. Product rules now confirmed
These decisions are locked into the initial build.

1. New users start with 1 credit.
2. Each active submission should be set to receive as many tests as possible by default.
3. Submissions must be live and accessible; screenshot-only submissions are not supported in MVP.
4. Submitters can edit questions after publishing, using versioning so old responses remain intact.
5. Responses are anonymous by default.
6. Submitters can rate each piece of feedback using a frowny face, neutral face, or smiley face.
7. Users receive an email when new feedback is available for one of their submitted products.

---

## 30. Final build brief
Create a clean, fast usability platform with a simple exchange loop: users submit a website or app, choose how feedback questions are created, verify their email, receive 1 starter credit, and immediately start earning more credits by testing other products. Submissions must be live and accessible, and they should remain open to receive as many tests as possible by default unless paused or closed. The testing experience should open the target product in a new tab while the questionnaire stays visible in the platform. All tests must be complete and reasonably high quality before submission and credit award. Responses should be anonymous by default. The My Tests area should make results easy to understand at both a summary and individual-response level, and submitters should be able to rate the quality of each response with a frowny, neutral, or smiley face. The platform must also email users when new feedback arrives so they can return and review it quickly. The product should launch with low friction, strong clarity, and clear trust controls so the platform feels fair, high quality, and easy to use from day one.

