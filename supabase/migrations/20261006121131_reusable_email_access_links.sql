begin;
set local lock_timeout = '5s';

-- These are reusable credentials, not public share tokens. Never store the raw token.
create table private.email_access_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  issued_to_email text not null,
  destination text not null check (destination in ('feedback', 'test')),
  resource_id uuid not null,
  entry text not null check (entry in ('feedback_email', 'test_back_email', 'other_email')),
  feedback_source text check (feedback_source = 'earn'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index email_access_links_owner on private.email_access_links(user_id) where revoked_at is null;
create table private.email_access_session_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claim_id uuid not null,
  lease_until timestamptz not null
);
create table private.email_access_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  requests integer not null
);
alter table private.email_access_links enable row level security;
alter table private.email_access_session_leases enable row level security;
alter table private.email_access_rate_limits enable row level security;
revoke all on private.email_access_links, private.email_access_session_leases,
  private.email_access_rate_limits from public, anon, authenticated;

create function private.issue_email_access_link(
  p_token_hash text, p_user_id uuid, p_email text, p_destination text,
  p_resource_id uuid, p_entry text, p_feedback_source text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize issuance with email changes and manual revocation.
  perform 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id=p_user_id and lower(u.email)=lower(trim(p_email))
    and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
    and p.ban_status='clear'
  for update of u;
  if not found then raise exception 'Email link recipient is unavailable.' using errcode='42501'; end if;
  if p_destination='feedback' and not exists (
    select 1 from public.test_responses r join public.submissions s on s.id=r.submission_id
    where r.id=p_resource_id and s.user_id=p_user_id
  ) then raise exception 'Email link destination is unavailable.' using errcode='42501'; end if;
  if p_destination='test' and not exists(select 1 from public.submissions where id=p_resource_id)
  then raise exception 'Email link destination is unavailable.' using errcode='42501'; end if;
  insert into private.email_access_links(token_hash,user_id,issued_to_email,destination,resource_id,entry,feedback_source)
  values(p_token_hash,p_user_id,lower(trim(p_email)),p_destination,p_resource_id,p_entry,p_feedback_source);
end $$;

create function private.resolve_email_access_link(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',l.id,'user_id',l.user_id,'email',l.issued_to_email,
    'destination',l.destination,'resource_id',l.resource_id,'entry',l.entry,'feedback_source',l.feedback_source)
  from private.email_access_links l join auth.users u on u.id=l.user_id
  join public.profiles p on p.id=u.id
  where l.token_hash=p_token_hash and l.revoked_at is null
    and lower(u.email)=l.issued_to_email and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= now()) and p.ban_status='clear';
$$;

create function private.claim_email_access_session(p_user_id uuid,p_claim_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into private.email_access_session_leases(user_id,claim_id,lease_until)
  values(p_user_id,p_claim_id,clock_timestamp()+interval '30 seconds')
  on conflict(user_id) do update set claim_id=excluded.claim_id,lease_until=excluded.lease_until
  where private.email_access_session_leases.lease_until <= clock_timestamp();
  return found;
end $$;
create function private.release_email_access_session(p_user_id uuid,p_claim_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.email_access_session_leases where user_id=p_user_id and claim_id=p_claim_id;
$$;

create function private.check_email_access_rate_limit(p_key_hash text,p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_start timestamptz := date_trunc('minute',clock_timestamp());
begin
  if p_limit not between 1 and 120 then return false; end if;
  delete from private.email_access_rate_limits where window_start < v_start-interval '2 minutes';
  insert into private.email_access_rate_limits(key_hash,window_start,requests) values(p_key_hash,v_start,1)
  on conflict(key_hash) do update set window_start=v_start,requests=
    case when private.email_access_rate_limits.window_start=v_start
      then private.email_access_rate_limits.requests+1 else 1 end
  returning requests into v_count;
  return v_count <= p_limit;
end $$;

create function private.revoke_my_email_access_links()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_count integer;
begin
  if v_user is null or not public.current_user_has_app_access() then
    raise exception 'Sign in to invalidate your email links.' using errcode='42501';
  end if;
  perform 1 from auth.users where id=v_user for update;
  update private.email_access_links set revoked_at=clock_timestamp() where user_id=v_user and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function private.revoke_email_access_on_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email is distinct from new.email then
    update private.email_access_links set revoked_at=clock_timestamp() where user_id=new.id and revoked_at is null;
  end if;
  return new;
end $$;
create trigger revoke_email_access_on_email_change after update of email on auth.users
  for each row execute function private.revoke_email_access_on_email_change();

-- PostgREST exposes only narrow wrappers. Privileged operations are service-role only.
create function public.issue_email_access_link(p_token_hash text,p_user_id uuid,p_email text,p_destination text,
  p_resource_id uuid,p_entry text,p_feedback_source text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.issue_email_access_link(p_token_hash,p_user_id,p_email,p_destination,p_resource_id,p_entry,p_feedback_source);
$$;
create function public.resolve_email_access_link(p_token_hash text)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.resolve_email_access_link(p_token_hash); $$;
create function public.claim_email_access_session(p_user_id uuid,p_claim_id uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.claim_email_access_session(p_user_id,p_claim_id); $$;
create function public.release_email_access_session(p_user_id uuid,p_claim_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.release_email_access_session(p_user_id,p_claim_id); $$;
create function public.check_email_access_rate_limit(p_key_hash text,p_limit integer)
returns boolean language sql security invoker set search_path = '' as $$ select private.check_email_access_rate_limit(p_key_hash,p_limit); $$;
create function public.revoke_my_email_access_links()
returns integer language sql security invoker set search_path = '' as $$ select private.revoke_my_email_access_links(); $$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') and p.proname in (
      'issue_email_access_link','resolve_email_access_link','claim_email_access_session',
      'release_email_access_session','check_email_access_rate_limit','revoke_my_email_access_links',
      'revoke_email_access_on_email_change')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant usage on schema private to service_role,authenticated;
grant execute on function private.revoke_my_email_access_links(), public.revoke_my_email_access_links() to authenticated;

-- Anonymous instruction/version reads traverse test_responses policies. The private
-- feedback helper must only be evaluated for authenticated requests.
alter policy responses_select_related on public.test_responses to authenticated;
notify pgrst, 'reload schema';
commit;
