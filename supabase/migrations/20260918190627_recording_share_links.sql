-- Capability links are created and resolved only by the recording access function.
-- No client role can enumerate tokens or make an unshared recording public.
create table public.recording_share_links (
  token uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.test_responses(id) on delete cascade,
  recording_bucket text not null,
  recording_path text not null,
  created_at timestamptz not null default now(),
  unique (response_id, recording_bucket, recording_path)
);

alter table public.recording_share_links enable row level security;
revoke all on public.recording_share_links from public, anon, authenticated;
grant select, insert, delete on public.recording_share_links to service_role;

comment on table public.recording_share_links is
  'Public recording capabilities. Each link is scoped to one recording source; replacement or deletion invalidates access.';
