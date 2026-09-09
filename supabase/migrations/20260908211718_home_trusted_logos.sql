-- Separate from the public homepage feed: only the backend can read or write
-- destination metadata and discovery leases. Images alone are publicly readable.
create table public.home_trusted_logo_cache (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  source_key text not null,
  logo_path text,
  source_image_url text,
  refresh_after timestamptz not null default now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.home_trusted_logo_cache enable row level security;
revoke all on public.home_trusted_logo_cache from public, anon, authenticated;
grant select, insert, update, delete on public.home_trusted_logo_cache to service_role;

create function public.claim_home_trusted_logo(p_submission_id uuid, p_source_key text)
returns setof public.home_trusted_logo_cache
language sql
security invoker
set search_path = ''
as $$
  insert into public.home_trusted_logo_cache as cache
    (submission_id, source_key, claim_token, lease_expires_at)
  values (p_submission_id, p_source_key, gen_random_uuid(), now() + interval '45 seconds')
  on conflict (submission_id) do update set
    source_key = excluded.source_key,
    logo_path = case when cache.source_key = excluded.source_key then cache.logo_path end,
    source_image_url = case when cache.source_key = excluded.source_key then cache.source_image_url end,
    refresh_after = case when cache.source_key = excluded.source_key then cache.refresh_after else now() end,
    claim_token = excluded.claim_token,
    lease_expires_at = excluded.lease_expires_at,
    updated_at = now()
  where cache.source_key <> excluded.source_key
    or (cache.refresh_after <= now() and
      (cache.lease_expires_at is null or cache.lease_expires_at <= now()))
  returning cache.*;
$$;

revoke all on function public.claim_home_trusted_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_home_trusted_logo(uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-trusted-logos', 'home-trusted-logos', true, 2097152,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/svg+xml']
);

-- No client storage write policies: the service role owns all image uploads.
comment on table public.home_trusted_logo_cache is
  'Backend-only cache for public homepage brand images. Verified source overrides are versioned with get-home-trusted-logos/sources.ts.';
