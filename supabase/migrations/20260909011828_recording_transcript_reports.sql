-- Durable source-derived transcripts. Worker state is persisted independently of its process.
create schema if not exists private;

create table public.recording_transcripts (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.test_responses(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  source_bucket text not null,
  source_path text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  provider text,
  model text,
  language text,
  duration_ms bigint check (duration_ms >= 0),
  full_text text not null default '',
  segments jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_id uuid,
  attempt_started_at timestamptz,
  lease_expires_at timestamptz,
  retry_after timestamptz not null default now(),
  last_error_code text,
  processed_at timestamptz,
  expires_at timestamptz check (expires_at is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recording_transcripts_owner_idx on public.recording_transcripts(owner_user_id);
create index recording_transcripts_pending_idx on public.recording_transcripts(retry_after, created_at)
  where status = 'pending';
create index recording_transcripts_lease_idx on public.recording_transcripts(lease_expires_at)
  where status = 'processing';
create index test_responses_transcript_report_idx on public.test_responses(submission_id, submitted_at desc, id)
  where recording_deleted_at is null and recording_bucket is not null and recording_path is not null;

create table public.transcript_words (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.recording_transcripts(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  segment_index integer not null check (segment_index >= 0),
  start_ms bigint not null check (start_ms >= 0),
  end_ms bigint not null check (end_ms >= start_ms),
  text text not null,
  unique(transcript_id, sequence)
);

alter table public.recording_transcripts enable row level security;
alter table public.transcript_words enable row level security;
revoke all on public.recording_transcripts, public.transcript_words from public, anon, authenticated;
grant all on public.recording_transcripts, public.transcript_words to service_role;
grant select (id, response_id, owner_user_id, status, provider, model, language, duration_ms,
  full_text, segments, processed_at, created_at, updated_at) on public.recording_transcripts to authenticated;
grant select on public.transcript_words to authenticated;

create policy transcript_owner_read on public.recording_transcripts for select to authenticated
using (
  owner_user_id = (select auth.uid()) and exists (
    select 1 from public.test_responses r join public.submissions s on s.id = r.submission_id
    where r.id = response_id and s.user_id = (select auth.uid())
      and r.recording_deleted_at is null and r.recording_bucket is not null and r.recording_path is not null
  )
);
create policy transcript_words_owner_read on public.transcript_words for select to authenticated
using (exists (select 1 from public.recording_transcripts t where t.id = transcript_id));

-- These trigger functions must write source-derived rows during authenticated response insertion.
-- They are private, cannot be invoked as RPCs, and derive ownership from the existing submission.
create function private.sync_recording_transcript() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.recording_deleted_at is not null or new.recording_bucket is null or new.recording_path is null then
    delete from public.recording_transcripts where response_id = new.id;
    return new;
  end if;
  select user_id into v_owner from public.submissions where id = new.submission_id;
  if v_owner is null then return new; end if;
  -- Changing a source invalidates its old text and any in-flight attempt.
  delete from public.recording_transcripts where response_id = new.id
    and (source_bucket <> new.recording_bucket or source_path <> new.recording_path or owner_user_id <> v_owner);
  insert into public.recording_transcripts(response_id, owner_user_id, source_bucket, source_path)
  values (new.id, v_owner, new.recording_bucket, new.recording_path)
  on conflict (response_id) do nothing;
  return new;
end;
$$;
revoke all on function private.sync_recording_transcript() from public, anon, authenticated;
create trigger sync_recording_transcript_after_save
after insert or update of recording_bucket, recording_path, recording_deleted_at, submission_id
on public.test_responses for each row execute function private.sync_recording_transcript();

create function private.sync_transcript_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    delete from public.recording_transcripts t using public.test_responses r
    where t.response_id = r.id and r.submission_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_transcript_owner() from public, anon, authenticated;
create trigger sync_transcript_owner_after_save after update of user_id on public.submissions
for each row execute function private.sync_transcript_owner();

-- Service-only RPCs use invoker privileges. Ownership checks also apply to every owner request.
create function public.claim_recording_transcripts(p_limit integer default 2)
returns setof public.recording_transcripts
language plpgsql security invoker set search_path = '' as $$
begin
  -- Backfill only a bounded batch of retained, accessible sources on each dispatch.
  insert into public.recording_transcripts(response_id, owner_user_id, source_bucket, source_path)
  select r.id, s.user_id, r.recording_bucket, r.recording_path
  from public.test_responses r join public.submissions s on s.id = r.submission_id
  where r.recording_deleted_at is null and r.recording_bucket is not null
    and r.recording_path is not null and s.user_id is not null
    and not exists (select 1 from public.recording_transcripts t where t.response_id = r.id)
  order by r.submitted_at desc, r.id limit 25
  on conflict (response_id) do nothing;

  -- Expired attempts cannot complete after recovery because their attempt id is discarded.
  update public.recording_transcripts
  set status = case when attempt_count >= 3 then 'failed' else 'pending' end,
    attempt_id = null, lease_expires_at = null, last_error_code = 'worker_timeout',
    retry_after = now() + interval '1 minute', updated_at = now()
  where status = 'processing' and lease_expires_at < now();

  return query
  with candidates as (
    select t.id from public.recording_transcripts t
    join public.test_responses r on r.id = t.response_id
    join public.submissions s on s.id = r.submission_id
    where t.status = 'pending' and t.retry_after <= now() and t.attempt_count < 3
      and r.recording_deleted_at is null and r.recording_bucket = t.source_bucket
      and r.recording_path = t.source_path and s.user_id = t.owner_user_id
    order by t.created_at, t.id limit greatest(1, least(p_limit, 4))
    for update of t skip locked
  )
  update public.recording_transcripts t set status = 'processing', attempt_count = t.attempt_count + 1,
    attempt_id = gen_random_uuid(), attempt_started_at = now(), lease_expires_at = now() + interval '15 minutes',
    updated_at = now(), last_error_code = null
  from candidates c where t.id = c.id returning t.*;
end;
$$;

create function public.finish_recording_transcript(
  p_response_id uuid, p_attempt_id uuid, p_event text, p_result jsonb default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.test_responses%rowtype;
  v_transcript public.recording_transcripts%rowtype;
  v_segments jsonb;
  v_error text;
begin
  -- Match deletion's lock order: source first, then transcript. No stale source may be resurrected.
  select * into v_source from public.test_responses where id = p_response_id for update;
  if not found or v_source.recording_deleted_at is not null then return false; end if;
  select * into v_transcript from public.recording_transcripts where response_id = p_response_id for update;
  if not found or v_transcript.attempt_id is distinct from p_attempt_id
    or v_transcript.status <> 'processing' or v_transcript.lease_expires_at <= now()
    or v_source.recording_bucket is distinct from v_transcript.source_bucket
    or v_source.recording_path is distinct from v_transcript.source_path
    or not exists (select 1 from public.submissions s where s.id = v_source.submission_id and s.user_id = v_transcript.owner_user_id)
  then return false; end if;

  if p_event = 'heartbeat' then
    if v_transcript.attempt_started_at < now() - interval '2 hours' then return false; end if;
    update public.recording_transcripts set lease_expires_at = now() + interval '15 minutes', updated_at = now()
    where id = v_transcript.id;
    return true;
  elsif p_event in ('failed', 'busy') then
    v_error := case when p_event = 'busy' then 'worker_busy' else 'transcription_failed' end;
    update public.recording_transcripts set
      status = case when p_event = 'busy' or attempt_count < 3 then 'pending' else 'failed' end,
      attempt_count = case when p_event = 'busy' then greatest(0, attempt_count - 1) else attempt_count end,
      attempt_id = null, lease_expires_at = null, last_error_code = v_error,
      retry_after = now() + case when attempt_count < 2 then interval '1 minute' else interval '5 minutes' end,
      updated_at = now()
    where id = v_transcript.id;
    return true;
  elsif p_event is distinct from 'completed' then
    raise exception 'Invalid transcript event';
  end if;

  if p_result is null or jsonb_typeof(p_result->'segments') is distinct from 'array'
    or jsonb_typeof(p_result->'fullText') is distinct from 'string'
    or nullif(p_result->>'provider', '') is null or nullif(p_result->>'model', '') is null
  then raise exception 'Invalid transcript result'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_result->'segments') segment
    where jsonb_typeof(segment->'text') is distinct from 'string'
      or jsonb_typeof(segment->'startMs') is distinct from 'number'
      or jsonb_typeof(segment->'endMs') is distinct from 'number'
      or (segment->>'startMs')::numeric < 0
      or (segment->>'endMs')::numeric < (segment->>'startMs')::numeric
  ) then raise exception 'Invalid transcript segment'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('startMs', segment->'startMs', 'endMs', segment->'endMs', 'text', segment->'text') order by ordinal), '[]')
  into v_segments from jsonb_array_elements(p_result->'segments') with ordinality entry(segment, ordinal);

  delete from public.transcript_words where transcript_id = v_transcript.id;
  insert into public.transcript_words(transcript_id, sequence, segment_index, start_ms, end_ms, text)
  select v_transcript.id, (row_number() over (order by start_ms, end_ms, segment_index, word_index) - 1)::integer,
    segment_index, start_ms, end_ms, word_text
  from (
    select distinct on ((word->>'startMs')::bigint, (word->>'endMs')::bigint, word->>'word')
      (ordinal - 1)::integer as segment_index, word_ordinal as word_index,
      (word->>'startMs')::bigint as start_ms, (word->>'endMs')::bigint as end_ms, word->>'word' as word_text
    from jsonb_array_elements(p_result->'segments') with ordinality entry(segment, ordinal)
    cross join lateral jsonb_array_elements(coalesce(segment->'words', '[]')) with ordinality words(word, word_ordinal)
    order by (word->>'startMs')::bigint, (word->>'endMs')::bigint, word->>'word', ordinal
  ) ordered_words;

  update public.recording_transcripts set status = 'ready', full_text = p_result->>'fullText',
    segments = v_segments, provider = p_result->>'provider', model = p_result->>'model',
    language = nullif(p_result->>'language', ''), duration_ms = (p_result->>'durationMs')::bigint,
    processed_at = now(), updated_at = now(), lease_expires_at = null, last_error_code = null
  where id = v_transcript.id;
  return true;
end;
$$;

create function public.retry_recording_transcript(p_owner uuid, p_response_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  update public.recording_transcripts t set status = 'pending', attempt_count = 0,
    attempt_id = null, lease_expires_at = null, retry_after = now(), last_error_code = null, updated_at = now()
  from public.test_responses r join public.submissions s on s.id = r.submission_id
  where t.response_id = p_response_id and r.id = t.response_id and s.user_id = p_owner
    and t.owner_user_id = p_owner and r.recording_deleted_at is null
    and r.recording_bucket = t.source_bucket and r.recording_path = t.source_path and t.status = 'failed';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create function public.get_transcript_report_page(
  p_owner uuid, p_app uuid default null, p_as_of timestamptz default now(),
  p_after_time timestamptz default null, p_after_id uuid default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_apps jsonb; v_app jsonb; v_rows jsonb;
begin
  select coalesce(jsonb_agg(app order by latest desc, id), '[]') into v_apps from (
    select s.id, max(r.submitted_at) as latest, jsonb_build_object(
      'id', s.id, 'productName', s.product_name, 'description', s.description,
      'targetAudience', s.target_audience,
      'instructionSteps', case when jsonb_array_length(coalesce(to_jsonb(s.instruction_steps), '[]')) > 0
        then to_jsonb(s.instruction_steps) when s.instructions <> '' then jsonb_build_array(s.instructions) else '[]'::jsonb end,
      'latestRecordingAt', max(r.submitted_at)
    ) app
    from public.submissions s join public.test_responses r on r.submission_id = s.id
    where s.user_id = p_owner and r.recording_deleted_at is null
      and r.recording_bucket is not null and r.recording_path is not null and r.submitted_at <= p_as_of
    group by s.id
  ) owned_apps;
  if p_app is null then v_app := v_apps->0;
  else select app into v_app from jsonb_array_elements(v_apps) app where app->>'id' = p_app::text; end if;
  if v_app is null then return jsonb_build_object('apps', v_apps, 'app', null, 'recordings', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(row_data order by submitted_at desc, id), '[]') into v_rows from (
    select r.id, r.submitted_at, jsonb_build_object(
      'responseId', r.id, 'submittedAt', r.submitted_at,
      'durationMs', coalesce(t.duration_ms, r.duration_seconds::bigint * 1000),
      'status', coalesce(t.status, 'pending'), 'language', t.language,
      'fullText', case when t.status = 'ready' then t.full_text else '' end,
      'segments', case when t.status = 'ready' then t.segments else '[]'::jsonb end
    ) row_data
    from public.test_responses r join public.submissions s on s.id = r.submission_id
    left join public.recording_transcripts t on t.response_id = r.id and t.owner_user_id = p_owner
      and t.source_bucket = r.recording_bucket and t.source_path = r.recording_path
    where s.user_id = p_owner and s.id = (v_app->>'id')::uuid and r.recording_deleted_at is null
      and r.recording_bucket is not null and r.recording_path is not null and r.submitted_at <= p_as_of
      and (p_after_time is null or r.submitted_at < p_after_time or (r.submitted_at = p_after_time and r.id > p_after_id))
    order by r.submitted_at desc, r.id limit 51
  ) page;
  return jsonb_build_object('apps', v_apps, 'app', v_app, 'recordings', v_rows);
end;
$$;

revoke all on function public.claim_recording_transcripts(integer),
  public.finish_recording_transcript(uuid, uuid, text, jsonb),
  public.retry_recording_transcript(uuid, uuid),
  public.get_transcript_report_page(uuid, uuid, timestamptz, timestamptz, uuid)
from public, anon, authenticated;
grant execute on function public.claim_recording_transcripts(integer),
  public.finish_recording_transcript(uuid, uuid, text, jsonb),
  public.retry_recording_transcript(uuid, uuid),
  public.get_transcript_report_page(uuid, uuid, timestamptz, timestamptz, uuid)
to service_role;

-- Schedule dispatch only where the existing hosted Cron / Vault infrastructure is present.
-- Missing rollout secrets keep processing paused; pending rows remain durable.
create function private.dispatch_recording_transcripts() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' order by created_at desc limit 1' into v_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''transcript_dispatch_secret'' order by created_at desc limit 1' into v_secret;
  if nullif(v_url, '') is null or nullif(v_secret, '') is null then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb, timeout_milliseconds := 10000)'
  into v_request using rtrim(v_url, '/') || '/functions/v1/dispatch-recording-transcripts',
    jsonb_build_object('Content-Type', 'application/json', 'x-transcript-dispatch-secret', v_secret);
  return v_request;
end;
$$;
revoke all on function private.dispatch_recording_transcripts() from public, anon, authenticated;
do $$
begin
  if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
    perform cron.schedule('dispatch-recording-transcripts', '* * * * *', 'select private.dispatch_recording_transcripts()');
  else
    raise notice 'Transcript dispatcher needs the existing pg_cron/pg_net setup before rollout.';
  end if;
end;
$$;
