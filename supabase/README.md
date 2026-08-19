# Supabase operations and future recording data

This guide distinguishes the current repository from the recording-first target in [`../usability_platform_product_plan.md`](../usability_platform_product_plan.md). It does not authorize a production migration.

## Authoritative setup path

Timestamped SQL files in [`migrations/`](migrations/) are the only authoritative database setup path. Apply them in filename order with the Supabase CLI or the repository’s approved deployment workflow, review the migration plan, and record the applied version.

Do not paste a monolithic schema into the SQL editor. The retired `.txt` bootstrap files were snapshots of earlier procedures and could omit later constraints, policies, grants, functions, or cleanup behavior.

For a new or restored environment:

1. Create the Supabase project and link the CLI to the intended project reference.
2. Review all migrations from the earliest timestamp through the intended release commit.
3. Apply migrations to a disposable or preview project first.
4. Enable email OTP and configure the OTP template and approved redirect URLs.
5. Configure browser-safe variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
6. Configure server secrets only in Supabase or the relevant worker. Never expose service, secret, SMTP, payment, storage, worker, or model keys to the browser.
7. Deploy only Edge Functions required by the reviewed release and validate their authentication mode, CORS, secrets, and rollback procedure.
8. Run RLS, grant, storage, auth, cleanup, retry, and end-to-end checks before production promotion.

The legacy `generate-ai-questions` function and question/answer schema support historical records. They are non-canonical for new recording-only tests and should not be part of a new-product setup checklist.

## Current repository behavior

### Working or substantially wired

- Auth, submissions, responses, credits, public test links, recording upload/access, notifications, and moderation have timestamped migrations and Edge Function code.
- Private recording upload and access use the `test-response-recordings` R2 path.
- Recording thumbnails have dedicated migration and worker integration in the current worktree.
- The recording-retention migration establishes a 60-day source lifetime.
- The video processor can return timestamped transcript data as part of report processing.

### Incomplete transcript integration

The repository does not yet have an applied canonical schema and owner workflow for durable transcript persistence, timed words, lifecycle status, retry, exact-range annotations, priorities, clips, or AI context filtering. A worker job returning transcript JSON is not equivalent to a complete transcript product.

Do not document transcript persistence as operational until migrations, RLS, grants, completion handling, backfill, retry, cleanup, and the owner interface are implemented and validated together.

## Future recording-first data requirements

Future migrations must implement the conceptual contracts in the product specification for:

- transcripts and ordered timed words;
- mutually exclusive yellow/red exact-range annotations;
- app-level improvement priorities and traceable sources;
- clips and hashed, revocable public share tokens;
- optional 1–5 star ratings;
- app-level AI conversations and context modes; and
- managed 3-, 5-, and 10-tester orders.

Legacy question and answer tables remain temporarily for existing records but are not used for new-test creation.

## Security requirements for future migrations

- Enable ownership-based RLS on every owner-scoped table before exposing it through the Data API.
- Grant `anon` and `authenticated` only the specific table, sequence, or function privileges they need. RLS and SQL grants are separate controls.
- Index every foreign-key column and columns used by ownership policies, token lookups, status queues, and expiration jobs. Use composite or partial indexes when they match actual filters.
- Evaluate stable auth helpers once per statement in RLS policies where possible.
- Put privileged helper functions in a non-exposed schema, set an empty or safe `search_path`, verify the caller, and revoke unnecessary execute privileges.
- Avoid broad `security definer` functions. Public clip resolution belongs behind a server endpoint using a narrowly scoped service credential.
- Keep media private. A successful clip-token exchange returns only approved clip metadata and a short-lived private-media URL; it never exposes the R2 bucket.
- Hash raw clip tokens and check revocation, deletion, and source expiration on every exchange.

## Retention, cleanup, and retry

- Derive every transcript, annotation, priority source, clip, and share expiration from its source recording.
- Use foreign-key cascades for owned database records and a separate idempotent queue for object-store deletion.
- Cleanup must record partial failures and retry without extending the 60-day lifetime.
- Transcript jobs must have pending, processing, ready, and failed states, bounded retry, idempotency, and an owner-visible retry path.
- Backfill only unexpired recordings whose private source object is still available.
- Logs must not contain transcript text, raw share tokens, signed media URLs, or secrets.

## Edge Function and secret review

The exact deployed function list is release-specific. Determine it from the application calls and reviewed migration/function changes rather than copying an old checklist. Common secret categories include:

- email delivery and sender identity;
- application base URL and approved origins;
- R2 recording credentials and worker shared secrets;
- video/transcript provider credentials and model configuration;
- reminder or cleanup cron secrets;
- test-account credentials used only by approved fixtures; and
- future payment and managed-order webhook credentials.

Functions configured with `--no-verify-jwt` require their own documented authentication and abuse controls. Public reachability is not authorization.

## Release boundary

Apply changes to a preview Supabase project first. Production migrations, secrets, schedules, function deploys, data backfills, and storage cleanup require separate approval and must be coordinated with the branch-promotion and Test4Test.io cutover gates in [`../cloudflare-pages-setup.txt`](../cloudflare-pages-setup.txt).
