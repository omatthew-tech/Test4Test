# Supabase Launch Setup

1. Create a Supabase project.
2. Run the SQL in the `supabase/migrations` folder in order, starting with `20260327_initial.sql` and continuing through the latest dated migration. The Google Play closed-test workflow requires `20260521_zz_google_play_closed_test_matching.sql` and `20260522_google_play_closed_test_follow_through.sql`.
3. In Auth, enable email OTP sign-in.
4. Update the email template so it sends the OTP token (for example using `{{ .Token }}`) instead of only a magic link.
5. In Auth URL configuration, set the site URL to `https://test4test.io`.
6. Add client env vars to `.env.local` or your deploy platform:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_TEST_ACCOUNT_EMAIL` (use `test@test4test.io` for the shared test account)
7. Add Supabase Edge Function secrets:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-5-mini`)
   - `SMTP2GO_API_KEY`
   - `SMTP2GO_SENDER`
   - `APP_BASE_URL` (for example `https://test4test.io`)
   - `TEST_REPORT_SUPPORT_EMAIL` (optional, defaults to `support@test4test.io`)
   - `TEST_BACK_REMINDER_CRON_SECRET`
   - `TEST_ACCOUNT_ENABLED=true`
   - `TEST_ACCOUNT_EMAIL=test@test4test.io`
   - `TEST_ACCOUNT_PASSWORD`
   - `TEST_ACCOUNT_OTP_CODE`
   - `VIDEO_PROCESSOR_URL`
   - `VIDEO_PROCESSOR_SHARED_SECRET` (must match `WORKER_SHARED_SECRET` in `services/video-processor`)
   - `GROQ_TRANSCRIPTION_MODEL` (optional, defaults to `whisper-large-v3-turbo`; set this to match the video worker if overridden)
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
8. Deploy the edge functions from:
   - `supabase/functions/generate-ai-questions`
   - `supabase/functions/send-test-results-notification`
   - `supabase/functions/send-test-back-reminders`
   - `supabase/functions/send-google-play-closed-test-reminders`
   - `supabase/functions/report-test`
   - `supabase/functions/manage-test-reports`
   - `supabase/functions/generate-usability-report`
   - `supabase/functions/list-usability-reports`
   - `supabase/functions/get-usability-report-status`
   - `supabase/functions/get-usability-report`
   - `supabase/functions/analyze-usability-report-quotes`
   - `supabase/functions/complete-usability-report`
   - `supabase/functions/test-account-login` with `--no-verify-jwt`
9. Create the reminder schedule described in `supabase/test-back-reminders-setup.txt`, and schedule `send-google-play-closed-test-reminders` daily with the same `TEST_BACK_REMINDER_CRON_SECRET`.
10. If you want to adjust copy later, edit rows in the `public.email_templates` table. The new feedback and reminder emails now render from database templates instead of hard-coded copy.
11. The final test-back reminder now applies the test-back-rate penalty at send time, so the Earn-page percentage and the email warning stay in sync.
12. Google Play closed-test matching uses a separate 14-day self-attested participation table. Earn discovery and test-back reminders stay pool-aware; direct/shared test URLs remain accessible for live submissions.
13. Seed the shared test fixture after secrets are set:
   - Dry run/list mode: `npm run seed:test-account`
   - Live seed: `npm run seed:test-account -- --apply`

Recommended free-stack deployment:
- Supabase free project for Auth, Postgres, and Edge Functions
- Cloudflare Pages free for the React app
