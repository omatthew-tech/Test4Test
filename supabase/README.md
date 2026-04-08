# Supabase Launch Setup

1. Create a Supabase project.
2. Run the SQL in the `supabase/migrations` folder in order, starting with `20260327_initial.sql` and continuing through `20260408_test_back_reminder_emails.sql`.
3. In Auth, enable email OTP sign-in.
4. Update the email template so it sends the OTP token (for example using `{{ .Token }}`) instead of only a magic link.
5. In Auth URL configuration, set the site URL to `https://test4test.io`.
6. Add client env vars to `.env.local` or your deploy platform:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
7. Add Supabase Edge Function secrets:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-5-mini`)
   - `SMTP2GO_API_KEY`
   - `SMTP2GO_SENDER`
   - `APP_BASE_URL` (for example `https://test4test.io`)
   - `TEST_BACK_REMINDER_CRON_SECRET`
8. Deploy the edge functions from:
   - `supabase/functions/generate-ai-questions`
   - `supabase/functions/send-test-results-notification`
   - `supabase/functions/send-test-back-reminders`
9. Create the reminder schedule described in `supabase/test-back-reminders-setup.txt`.
10. If you want to adjust copy later, edit rows in the `public.email_templates` table. The new feedback and reminder emails now render from database templates instead of hard-coded copy.

Recommended free-stack deployment:
- Supabase free project for Auth, Postgres, and Edge Functions
- Cloudflare Pages free for the React app
