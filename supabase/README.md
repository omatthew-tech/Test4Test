# Supabase Launch Setup

1. Create a Supabase project.
2. Run the SQL in the `supabase/migrations` folder in order, starting with `20260327_initial.sql` and continuing through `20260408_question_set_version_metadata.sql`.
3. In Auth, enable email OTP sign-in.
4. Update the email template so it sends the OTP token (for example using `{{ .Token }}`) instead of only a magic link.
5. In Auth URL configuration, set the site URL to `https://test4test.io`.
6. Add client env vars to `.env.local` or your deploy platform:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
7. Add Supabase Edge Function secrets:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-5-mini`)
8. Deploy the edge function from `supabase/functions/generate-ai-questions`.

Recommended free-stack deployment:
- Supabase free project for Auth, Postgres, and Edge Functions
- Cloudflare Pages free for the React app





