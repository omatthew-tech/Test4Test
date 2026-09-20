-- Clips are private derived media. Only the server exchanges hashed capabilities.
create schema if not exists private;
create table public.recording_clips (
  id uuid primary key,
  response_id uuid not null references public.test_responses(id) on delete cascade,
  -- Versioning is optional: existing deployments still store media on the response.
  version_id uuid,
  creator_id uuid not null references auth.users(id) on delete cascade,
  source_bucket text not null,
  source_path text not null,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms - start_ms >= 100 and end_ms <= 86400000),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  attempts integer not null default 0,
  attempt_id uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz not null default now(),
  output_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ready') = (output_path is not null)),
  check (status <> 'processing' or (attempt_id is not null and lease_expires_at is not null))
);
create index recording_clips_response_idx on public.recording_clips(response_id);
create index recording_clips_version_idx on public.recording_clips(version_id);
create index recording_clips_creator_idx on public.recording_clips(creator_id, created_at);
create index recording_clips_pending_idx on public.recording_clips(retry_after) where status = 'pending';
create index recording_clips_lease_idx on public.recording_clips(lease_expires_at) where status = 'processing';
alter table public.recording_clips enable row level security;
revoke all on public.recording_clips from anon, authenticated;
grant select, insert, update, delete on public.recording_clips to service_role;

-- Register every possible output before dispatch so crashes and late uploads are cleaned up.
create table public.recording_clip_assets (
  object_path text primary key check (object_path ~ '^recording-clips/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'),
  clip_id uuid references public.recording_clips(id) on delete set null,
  attempt_id uuid not null,
  created_at timestamptz not null default now()
);
create index recording_clip_assets_clip_idx on public.recording_clip_assets(clip_id);
create index recording_clip_assets_created_idx on public.recording_clip_assets(created_at);
alter table public.recording_clip_assets enable row level security;
revoke all on public.recording_clip_assets from anon, authenticated;
grant select, insert, delete on public.recording_clip_assets to service_role;

create function private.clip_source_available(c public.recording_clips) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
begin
  if c.version_id is null then
    return exists (
      select 1 from public.test_responses r join public.submissions s on s.id = r.submission_id
      where r.id = c.response_id and r.recording_deleted_at is null
        and (c.creator_id = r.tester_user_id or c.creator_id = s.user_id)
        and r.recording_bucket = c.source_bucket and r.recording_path = c.source_path
    );
  end if;
  if to_regclass('public.test_response_versions') is null then return false; end if;
  return exists (
    select 1 from public.test_responses r join public.submissions s on s.id = r.submission_id
    join public.test_response_versions v on v.id = c.version_id and v.response_id = r.id
    where r.id = c.response_id and r.recording_deleted_at is null
      and (c.creator_id = r.tester_user_id or c.creator_id = s.user_id)
      and v.recording_deleted_at is null and v.recording_bucket = c.source_bucket and v.recording_path = c.source_path
  );
end;
$$;
revoke all on function private.clip_source_available(public.recording_clips) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.clip_source_available(public.recording_clips) to service_role;

create function public.create_recording_clip(
  p_id uuid, p_response_id uuid, p_version_id uuid, p_creator_id uuid,
  p_source_bucket text, p_source_path text, p_start_ms integer, p_end_ms integer, p_token_hash text
) returns public.recording_clips language plpgsql security invoker set search_path = '' as $$
declare c public.recording_clips;
begin
  -- Serialize per creator to enforce a bounded export budget even across concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(p_creator_id::text, 0));
  select * into c from public.recording_clips where id = p_id;
  if found then
    if c.creator_id <> p_creator_id or c.token_hash <> p_token_hash
      or c.response_id <> p_response_id or c.version_id is distinct from p_version_id
      or c.source_bucket <> p_source_bucket or c.source_path <> p_source_path
      or c.start_ms <> p_start_ms or c.end_ms <> p_end_ms then
      raise exception 'Clip request conflict' using errcode = '22023';
    end if;
    return c;
  end if;
  if (select count(*) from public.recording_clips where creator_id = p_creator_id and created_at > now() - interval '1 hour') >= 20
    or (select count(*) from public.recording_clips where creator_id = p_creator_id and status in ('pending', 'processing')) >= 3 then
    raise exception 'Clip limit reached' using errcode = 'P0001';
  end if;
  insert into public.recording_clips(id, response_id, version_id, creator_id, source_bucket, source_path, start_ms, end_ms, token_hash)
  values(p_id, p_response_id, p_version_id, p_creator_id, p_source_bucket, p_source_path, p_start_ms, p_end_ms, p_token_hash)
  returning * into c;
  if not private.clip_source_available(c) then raise exception 'Recording unavailable' using errcode = '42501'; end if;
  return c;
end;
$$;

create function public.claim_recording_clips(p_limit integer default 2, p_clip_id uuid default null)
returns setof public.recording_clips language plpgsql security invoker set search_path = '' as $$
declare c public.recording_clips;
begin
  delete from public.recording_clips doomed where not private.clip_source_available(doomed);
  update public.recording_clips set status = case when attempts >= 3 then 'failed' else 'pending' end,
    lease_expires_at = null, retry_after = now(), updated_at = now()
    where status = 'processing' and lease_expires_at < now();
  for c in
    select * from public.recording_clips where status = 'pending' and retry_after <= now()
      and (p_clip_id is null or id = p_clip_id) order by created_at limit least(greatest(p_limit, 1), 2)
      for update skip locked
  loop
    update public.recording_clips set status = 'processing', attempts = attempts + 1,
      attempt_id = gen_random_uuid(), lease_expires_at = now() + interval '15 minutes', updated_at = now()
      where id = c.id returning * into c;
    insert into public.recording_clip_assets(object_path, clip_id, attempt_id)
      values('recording-clips/' || c.id || '/' || c.attempt_id || '.mp4', c.id, c.attempt_id);
    return next c;
  end loop;
end;
$$;

create function public.finish_recording_clip(p_id uuid, p_attempt_id uuid, p_event text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare c public.recording_clips;
begin
  select * into c from public.recording_clips where id = p_id for update;
  if not found or c.attempt_id is distinct from p_attempt_id or not private.clip_source_available(c) then return false; end if;
  -- A repeated completion acknowledges the same output after a lost HTTP response.
  if c.status = 'ready' and p_event = 'completed' then return true; end if;
  if c.status <> 'processing' or c.lease_expires_at <= now() then return false; end if;
  if p_event = 'heartbeat' then
    update public.recording_clips set lease_expires_at = now() + interval '15 minutes' where id = p_id;
  elsif p_event = 'completed' then
    update public.recording_clips set status = 'ready', lease_expires_at = null, updated_at = now(),
      output_path = 'recording-clips/' || id || '/' || attempt_id || '.mp4' where id = p_id;
  elsif p_event in ('failed', 'busy') then
    update public.recording_clips set status = case when attempts >= 3 then 'failed' else 'pending' end,
      lease_expires_at = null, retry_after = now() + interval '1 minute', updated_at = now() where id = p_id;
  else raise exception 'Invalid clip event' using errcode = '22023'; end if;
  return true;
end;
$$;

create function public.retry_recording_clip(p_id uuid, p_creator_id uuid)
returns public.recording_clips language plpgsql security invoker set search_path = '' as $$
declare c public.recording_clips;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_creator_id::text, 0));
  select * into c from public.recording_clips where id = p_id and creator_id = p_creator_id for update;
  if not found or not private.clip_source_available(c) then raise exception 'Recording unavailable' using errcode = '42501'; end if;
  if c.status <> 'failed' then return c; end if;
  if c.attempts >= 6 then raise exception 'Clip retry limit reached' using errcode = '22023'; end if;
  if (select count(*) from public.recording_clips where creator_id = p_creator_id and status in ('pending', 'processing')) >= 3 then
    raise exception 'Clip limit reached' using errcode = 'P0001';
  end if;
  update public.recording_clips set status = 'pending', retry_after = now(), updated_at = now()
    where id = p_id returning * into c;
  return c;
end;
$$;

create function public.recording_clip_garbage() returns setof public.recording_clip_assets
language sql stable security invoker set search_path = '' as $$
  select a.* from public.recording_clip_assets a left join public.recording_clips c on c.id = a.clip_id
  where a.created_at < now() - interval '1 hour'
    and (c.id is null or c.attempt_id is distinct from a.attempt_id or c.status in ('failed', 'pending'))
  order by a.created_at limit 50;
$$;

-- Invalidate source-derived capabilities immediately, retaining the asset deletion ledger.
create function private.invalidate_recording_clips() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'test_responses' then
    delete from public.recording_clips where response_id = new.id and
      (new.recording_deleted_at is not null or (version_id is null and
        (source_bucket is distinct from new.recording_bucket or source_path is distinct from new.recording_path)));
  else
    delete from public.recording_clips where version_id = new.id and
      (new.recording_deleted_at is not null or source_bucket is distinct from new.recording_bucket or source_path is distinct from new.recording_path);
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_recording_clips() from public, anon, authenticated;
create trigger invalidate_response_clips after update of recording_bucket, recording_path, recording_deleted_at
on public.test_responses for each row execute function private.invalidate_recording_clips();
-- Install version guards when versions already exist. The versioning migration also
-- installs these guards when it is applied after clipping on a legacy deployment.
do $$ begin
  if to_regclass('public.test_response_versions') is not null then
    alter table public.recording_clips add constraint recording_clips_version_id_fkey
      foreign key (version_id) references public.test_response_versions(id) on delete cascade;
    create trigger invalidate_version_clips after update of recording_bucket, recording_path, recording_deleted_at
      on public.test_response_versions for each row execute function private.invalidate_recording_clips();
  end if;
end; $$;

revoke all on function public.create_recording_clip(uuid, uuid, uuid, uuid, text, text, integer, integer, text),
  public.claim_recording_clips(integer, uuid), public.finish_recording_clip(uuid, uuid, text), public.retry_recording_clip(uuid, uuid), public.recording_clip_garbage()
from public, anon, authenticated;
grant execute on function public.create_recording_clip(uuid, uuid, uuid, uuid, text, text, integer, integer, text),
  public.claim_recording_clips(integer, uuid), public.finish_recording_clip(uuid, uuid, text), public.retry_recording_clip(uuid, uuid), public.recording_clip_garbage()
to service_role;

-- Reuse the existing dispatcher secret and Vault infrastructure. No new public scheduler.
create function private.dispatch_recording_clips() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' order by created_at desc limit 1' into v_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''transcript_dispatch_secret'' order by created_at desc limit 1' into v_secret;
  if nullif(v_url, '') is null or nullif(v_secret, '') is null then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb, timeout_milliseconds := 10000)'
  into v_request using rtrim(v_url, '/') || '/functions/v1/dispatch-recording-clips',
    jsonb_build_object('Content-Type', 'application/json', 'x-transcript-dispatch-secret', v_secret);
  return v_request;
end;
$$;
revoke all on function private.dispatch_recording_clips() from public, anon, authenticated;
do $$ begin
  if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
    perform cron.schedule('dispatch-recording-clips', '* * * * *', 'select private.dispatch_recording_clips()');
  else raise notice 'Clip dispatch requires pg_cron/pg_net and existing Vault dispatcher secrets.'; end if;
end; $$;
