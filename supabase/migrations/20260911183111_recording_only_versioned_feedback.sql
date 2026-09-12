-- One response remains the unit of counting, credits and payments. Versions own media.
create schema if not exists private;
update public.submissions set requires_recording = true where requires_recording = false;
alter table public.submissions alter column requires_recording set default true;
alter table public.submissions add constraint submissions_recording_required check (requires_recording);

-- Older creation/editing clients may still send false; all saved tests use recording capture.
create function private.require_test_recording() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.requires_recording := true;
  return new;
end;
$$;
revoke all on function private.require_test_recording() from public, anon, authenticated;
create trigger require_test_recording before insert or update of requires_recording
on public.submissions for each row execute function private.require_test_recording();

create table public.test_response_versions (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.test_responses(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  submitted_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  rating_snapshot jsonb not null default '[]'::jsonb,
  recording_bucket text,
  recording_path text,
  recording_file_name text,
  recording_mime_type text,
  recording_file_size_bytes bigint,
  recording_uploaded_at timestamptz,
  recording_deleted_at timestamptz,
  thumbnail_bucket text,
  thumbnail_path text,
  unique (response_id, version_number)
);
create index test_response_versions_report_idx on public.test_response_versions(submitted_at desc, id);
create index test_response_versions_media_idx on public.test_response_versions(recording_bucket, recording_path);
alter table public.test_response_versions enable row level security;
revoke all on public.test_response_versions from public, anon, authenticated;
grant select on public.test_response_versions to authenticated;
grant all on public.test_response_versions to service_role;
create policy response_versions_read on public.test_response_versions for select to authenticated
using (exists (
  select 1 from public.test_responses r join public.submissions s on s.id = r.submission_id
  where r.id = response_id and (r.tester_user_id = (select auth.uid()) or s.user_id = (select auth.uid()))
));

insert into public.test_response_versions (
  response_id, version_number, submitted_at, duration_seconds, answers, rating_snapshot,
  recording_bucket, recording_path, recording_file_name, recording_mime_type,
  recording_file_size_bytes, recording_uploaded_at, recording_deleted_at
)
select r.id, 1, r.submitted_at, greatest(0, r.duration_seconds), r.answers,
  coalesce((select jsonb_agg(to_jsonb(f)) from public.feedback_ratings f where f.test_response_id = r.id), '[]'),
  r.recording_bucket, r.recording_path, r.recording_file_name, r.recording_mime_type,
  r.recording_file_size_bytes, r.recording_uploaded_at, r.recording_deleted_at
from public.test_responses r;

-- Preserve transcripts and word ids while moving their source identity to a version.
alter table public.recording_transcripts add column version_id uuid references public.test_response_versions(id) on delete cascade;
update public.recording_transcripts t set version_id = v.id
from public.test_response_versions v where v.response_id = t.response_id and v.version_number = 1;
alter table public.recording_transcripts alter column version_id set not null;
alter table public.recording_transcripts drop constraint recording_transcripts_response_id_key;
alter table public.recording_transcripts add constraint recording_transcripts_version_id_key unique(version_id);
create index recording_transcripts_response_idx on public.recording_transcripts(response_id);
grant select(version_id) on public.recording_transcripts to authenticated;

drop trigger sync_recording_transcript_after_save on public.test_responses;
drop policy transcript_owner_read on public.recording_transcripts;
create policy transcript_owner_read on public.recording_transcripts for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.test_response_versions v join public.test_responses r on r.id = v.response_id
  join public.submissions s on s.id = r.submission_id
  where v.id = version_id and s.user_id = (select auth.uid()) and v.recording_deleted_at is null
    and v.recording_bucket is not null and v.recording_path is not null
));

create function private.sync_version_transcript() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.recording_deleted_at is not null or new.recording_bucket is null or new.recording_path is null then
    delete from public.recording_transcripts where version_id = new.id;
    return new;
  end if;
  select s.user_id into v_owner from public.test_responses r
    join public.submissions s on s.id = r.submission_id where r.id = new.response_id;
  if v_owner is not null then
    insert into public.recording_transcripts(response_id, version_id, owner_user_id, source_bucket, source_path)
    values(new.response_id, new.id, v_owner, new.recording_bucket, new.recording_path)
    on conflict(version_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_version_transcript() from public, anon, authenticated;
create trigger version_transcript_after_save after insert or update of recording_deleted_at
on public.test_response_versions for each row execute function private.sync_version_transcript();

create function private.capture_initial_response_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.test_response_versions(response_id, version_number, submitted_at, duration_seconds,
    answers, recording_bucket, recording_path, recording_file_name, recording_mime_type,
    recording_file_size_bytes, recording_uploaded_at, recording_deleted_at)
  values(new.id, 1, new.submitted_at, greatest(0, new.duration_seconds), new.answers,
    new.recording_bucket, new.recording_path, new.recording_file_name, new.recording_mime_type,
    new.recording_file_size_bytes, new.recording_uploaded_at, new.recording_deleted_at);
  return new;
end;
$$;
revoke all on function private.capture_initial_response_version() from public, anon, authenticated;
create trigger capture_initial_response_version after insert on public.test_responses
for each row execute function private.capture_initial_response_version();

-- Deleting all media on a logical response invalidates every version and pending job.
create function private.delete_response_version_media() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.recording_deleted_at is not null then
    update public.test_response_versions set recording_deleted_at = new.recording_deleted_at
    where response_id = new.id and recording_deleted_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.delete_response_version_media() from public, anon, authenticated;
create trigger delete_response_version_media after update of recording_deleted_at on public.test_responses
for each row execute function private.delete_response_version_media();

create function public.revise_test_recording(
  p_response_id uuid, p_recording_bucket text, p_recording_path text,
  p_duration_seconds integer, p_expected_version_number integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_response public.test_responses%rowtype;
  v_submission public.submissions%rowtype;
  v_upload public.test_response_recording_uploads%rowtype;
  v_previous public.test_response_versions%rowtype;
  v_version public.test_response_versions%rowtype;
begin
  if v_user is null or not public.current_user_has_app_access() then
    raise exception 'Sign in with an active account to revise feedback.';
  end if;
  if p_expected_version_number is null or p_expected_version_number < 1 then
    raise exception 'Reload your submitted feedback before revising it.';
  end if;
  select * into v_response from public.test_responses
  where id = p_response_id and tester_user_id = v_user for update;
  if not found then raise exception 'That feedback could not be found.'; end if;

  -- Resolve retries before checking the rating, which was cleared on successful submission.
  select * into v_version from public.test_response_versions
  where response_id = p_response_id and recording_bucket = p_recording_bucket and recording_path = p_recording_path
    and version_number = p_expected_version_number + 1;
  if found then
    return jsonb_build_object('ok', true, 'responseId', p_response_id, 'versionId', v_version.id,
      'versionNumber', v_version.version_number, 'message', 'Revised recording submitted.');
  end if;
  select * into v_previous from public.test_response_versions
  where response_id = p_response_id order by version_number desc limit 1;
  if v_previous.version_number is distinct from p_expected_version_number then
    raise exception 'This feedback has changed. Reload it before submitting a revision.';
  end if;
  select * into v_submission from public.submissions where id = v_response.submission_id for share;
  if v_submission.status <> 'live' or not public.profile_is_clear(v_submission.user_id) then
    raise exception 'That test is no longer open for revisions.';
  end if;
  if exists(select 1 from public.feedback_rating_reports where test_response_id = p_response_id and status = 'pending') then
    raise exception 'That feedback is currently under review.';
  end if;
  perform 1 from public.feedback_ratings where test_response_id = p_response_id
    and rated_by_user_id = v_submission.user_id and rating_value in ('neutral', 'frowny') for update;
  if not found then raise exception 'Only feedback rated neutral or unhelpful can be revised.'; end if;
  if p_recording_bucket is distinct from 'r2:test-response-recordings' or nullif(trim(p_recording_path), '') is null then
    raise exception 'Upload a new screen and voice recording before submitting your revision.';
  end if;
  select * into v_upload from public.test_response_recording_uploads
  where storage_bucket = p_recording_bucket and object_key = p_recording_path
    and tester_user_id = v_user and status = 'completed' and attached_response_id is null for update;
  if not found or split_part(p_recording_path, '/', 1) <> 'draft'
    or split_part(p_recording_path, '/', 2) <> v_user::text or v_upload.file_size_bytes <= 0 then
    raise exception 'The completed recording upload could not be found.';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 0 then raise exception 'Invalid recording duration.'; end if;

  update public.test_response_versions set rating_snapshot =
    coalesce((select jsonb_agg(to_jsonb(f)) from public.feedback_ratings f where f.test_response_id = p_response_id), '[]')
  where id = v_previous.id;
  insert into public.test_response_versions(response_id, version_number, submitted_at, duration_seconds,
    recording_bucket, recording_path, recording_file_name, recording_mime_type,
    recording_file_size_bytes, recording_uploaded_at, thumbnail_bucket, thumbnail_path)
  values(p_response_id, v_previous.version_number + 1, now(), p_duration_seconds,
    p_recording_bucket, p_recording_path, v_upload.file_name, v_upload.mime_type,
    v_upload.file_size_bytes, coalesce(v_upload.uploaded_at, now()), v_upload.thumbnail_storage_bucket,
    v_upload.thumbnail_path) returning * into v_version;

  update public.test_response_recording_uploads set attached_response_id = p_response_id, updated_at = now()
    where id = v_upload.id;
  update public.test_responses set answers = '[]', duration_seconds = p_duration_seconds,
    submitted_at = v_version.submitted_at, recording_bucket = p_recording_bucket, recording_path = p_recording_path,
    recording_file_name = v_upload.file_name, recording_mime_type = v_upload.mime_type,
    recording_file_size_bytes = v_upload.file_size_bytes, recording_uploaded_at = v_version.recording_uploaded_at,
    recording_deleted_at = null, recording_expires_at = null
  where id = p_response_id;
  delete from public.feedback_ratings where test_response_id = p_response_id;
  return jsonb_build_object('ok', true, 'responseId', p_response_id, 'versionId', v_version.id,
    'versionNumber', v_version.version_number, 'message', 'Revised recording submitted.');
end;
$$;
revoke all on function public.revise_test_recording(uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.revise_test_recording(uuid,text,text,integer,integer) to authenticated;
revoke all on function public.revise_test_response(uuid,jsonb,integer) from public, anon, authenticated;


create or replace function public.claim_recording_transcripts(p_limit integer default 2)
returns setof public.recording_transcripts
language plpgsql security invoker set search_path = '' as $$
begin
  -- Backfill only a bounded batch of retained, accessible sources on each dispatch.
  insert into public.recording_transcripts(response_id, version_id, owner_user_id, source_bucket, source_path)
  select r.response_id, r.id, s.user_id, r.recording_bucket, r.recording_path
  from public.test_response_versions r join public.test_responses response on response.id = r.response_id join public.submissions s on s.id = response.submission_id
  where r.recording_deleted_at is null and r.recording_bucket is not null
    and r.recording_path is not null and s.user_id is not null
    and not exists (select 1 from public.recording_transcripts t where t.version_id = r.id)
  order by r.submitted_at desc, r.id limit 25
  on conflict (version_id) do nothing;

  -- Expired attempts cannot complete after recovery because their attempt id is discarded.
  update public.recording_transcripts
  set status = case when attempt_count >= 3 then 'failed' else 'pending' end,
    attempt_id = null, lease_expires_at = null, last_error_code = 'worker_timeout',
    retry_after = now() + interval '1 minute', updated_at = now()
  where status = 'processing' and lease_expires_at < now();

  return query
  with candidates as (
    select t.id from public.recording_transcripts t
    join public.test_response_versions r on r.id = t.version_id
    join public.test_responses response on response.id = r.response_id
    join public.submissions s on s.id = response.submission_id
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

drop function public.finish_recording_transcript(uuid,uuid,text,jsonb);
create or replace function public.finish_recording_transcript(
  p_response_id uuid, p_attempt_id uuid, p_event text, p_result jsonb default null, p_version_id uuid default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.test_response_versions%rowtype;
  v_transcript public.recording_transcripts%rowtype;
  v_segments jsonb;
  v_error text;
begin
  -- Match deletion's lock order: source first, then transcript. No stale source may be resurrected.
  perform 1 from public.test_responses where id = p_response_id for update;
  if not found then return false; end if;
  select v.* into v_source from public.test_response_versions v join public.recording_transcripts t on t.version_id = v.id
  where t.response_id = p_response_id and t.attempt_id = p_attempt_id
    and (p_version_id is null or v.id = p_version_id) for update of v;
  if not found or v_source.recording_deleted_at is not null then return false; end if;
  select * into v_transcript from public.recording_transcripts where response_id = p_response_id and version_id = v_source.id for update;
  if not found or v_transcript.attempt_id is distinct from p_attempt_id
    or v_transcript.status <> 'processing' or v_transcript.lease_expires_at <= now()
    or v_source.recording_bucket is distinct from v_transcript.source_bucket
    or v_source.recording_path is distinct from v_transcript.source_path
    or not exists (select 1 from public.submissions s join public.test_responses r on r.submission_id = s.id where r.id = v_source.response_id and s.user_id = v_transcript.owner_user_id)
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

revoke all on function public.finish_recording_transcript(uuid,uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.finish_recording_transcript(uuid,uuid,text,jsonb,uuid) to service_role;

drop function public.retry_recording_transcript(uuid,uuid);

create or replace function public.retry_recording_transcript(p_owner uuid, p_response_id uuid, p_version_id uuid default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  update public.recording_transcripts t set status = 'pending', attempt_count = 0,
    attempt_id = null, lease_expires_at = null, retry_after = now(), last_error_code = null, updated_at = now()
  from public.test_response_versions r join public.test_responses response on response.id = r.response_id join public.submissions s on s.id = response.submission_id
  where t.response_id = p_response_id and r.id = t.version_id and s.user_id = p_owner
    and r.id = coalesce(p_version_id, (select latest.id from public.test_response_versions latest where latest.response_id = p_response_id order by version_number desc limit 1))
    and t.owner_user_id = p_owner and r.recording_deleted_at is null
    and r.recording_bucket = t.source_bucket and r.recording_path = t.source_path and t.status = 'failed';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.retry_recording_transcript(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.retry_recording_transcript(uuid,uuid,uuid) to service_role;

create or replace function public.reuse_existing_recording_transcripts(
  p_limit integer default 25, p_owner uuid default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_record record; v_job public.recording_transcripts%rowtype; v_count integer := 0; v_result jsonb;
begin
  for v_record in
    select r.response_id, r.id version_id, r.recording_bucket, r.recording_path, s.user_id owner_id,
      old.id legacy_id, old.full_text, old.provider, old.model, old.language,
      old.duration_ms, old.completed_at
    from public.test_response_versions r
    join public.test_responses response on response.id = r.response_id
    join public.submissions s on s.id = response.submission_id
    join public.test_response_transcripts old on old.test_response_id = r.response_id and r.version_number = 1
    left join public.recording_transcripts current on current.version_id = r.id
    where old.status = 'completed' and old.full_text is not null
      and nullif(old.provider, '') is not null and nullif(old.model, '') is not null
      and old.completed_at >= coalesce(r.recording_uploaded_at, r.submitted_at)
      and r.recording_deleted_at is null and r.recording_bucket is not null and r.recording_path is not null
      and (p_owner is null or s.user_id = p_owner)
      and (current.id is null or (current.status = 'pending' and current.attempt_count = 0))
    order by old.completed_at, r.id limit greatest(1, least(p_limit, 25))
    for update of response skip locked
  loop
    insert into public.recording_transcripts(response_id, version_id, owner_user_id, source_bucket, source_path)
    values(v_record.response_id, v_record.version_id, v_record.owner_id, v_record.recording_bucket, v_record.recording_path)
    on conflict (version_id) do nothing;
    select * into v_job from public.recording_transcripts where version_id = v_record.version_id for update;
    if v_job.status <> 'pending' or v_job.attempt_count <> 0
      or v_job.owner_user_id <> v_record.owner_id or v_job.source_bucket <> v_record.recording_bucket
      or v_job.source_path <> v_record.recording_path then continue; end if;

    select jsonb_build_object('provider', v_record.provider, 'model', v_record.model,
      'fullText', v_record.full_text, 'language', v_record.language, 'durationMs', v_record.duration_ms,
      'segments', coalesce(jsonb_agg(jsonb_build_object('startMs', seg.start_ms, 'endMs', seg.end_ms,
        'text', seg.text, 'words', coalesce(seg.words, '[]'::jsonb)) order by seg.segment_index), '[]'::jsonb))
    into v_result from public.test_response_transcript_segments seg where seg.transcript_id = v_record.legacy_id;
    update public.recording_transcripts set status = 'processing', attempt_count = 1,
      attempt_id = gen_random_uuid(), attempt_started_at = now(), lease_expires_at = now() + interval '15 minutes'
    where id = v_job.id returning * into v_job;
    if public.finish_recording_transcript(v_record.response_id, v_job.attempt_id, 'completed', v_result) then
      update public.recording_transcripts set processed_at = v_record.completed_at where id = v_job.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Read structured tasks when present, while supporting the retained legacy instructions schema.
create or replace function public.get_transcript_report_page_delta(
  p_owner uuid, p_app uuid default null, p_as_of timestamptz default now(),
  p_after_time timestamptz default null, p_after_id uuid default null,
  p_known_versions jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_apps jsonb; v_app jsonb; v_rows jsonb;
begin
  select coalesce(jsonb_agg(app order by latest desc, id), '[]') into v_apps from (
    select s.id, max(r.submitted_at) as latest, jsonb_build_object(
      'id', s.id, 'productName', s.product_name, 'description', s.description,
      'targetAudience', s.target_audience,
      'instructionSteps', case
        when jsonb_typeof(to_jsonb(s)->'instruction_steps') = 'array'
          and to_jsonb(s)->'instruction_steps' <> '[]'::jsonb then to_jsonb(s)->'instruction_steps'
        when s.instructions <> '' then jsonb_build_array(s.instructions)
        else '[]'::jsonb end,
      'latestRecordingAt', max(r.submitted_at)
    ) app
    from public.submissions s join public.test_responses response on response.submission_id = s.id join public.test_response_versions r on r.response_id = response.id
    where s.user_id = p_owner and r.recording_deleted_at is null
      and r.recording_bucket is not null and r.recording_path is not null and r.submitted_at <= p_as_of
    group by s.id
  ) owned_apps;
  if p_app is null then v_app := v_apps->0;
  else select app into v_app from jsonb_array_elements(v_apps) app where app->>'id' = p_app::text; end if;
  if v_app is null then return jsonb_build_object('apps', v_apps, 'app', null, 'recordings', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(row_data order by submitted_at desc, id), '[]') into v_rows from (
    select r.id, r.submitted_at, jsonb_build_object(
      'responseId', r.response_id, 'versionId', r.id, 'versionNumber', r.version_number, 'submittedAt', r.submitted_at,
      'durationMs', coalesce(t.duration_ms, r.duration_seconds::bigint * 1000),
      'status', coalesce(t.status, 'pending'), 'language', t.language,
      'revision', versions.revision,
      'unchanged', coalesce(p_known_versions->>r.id::text = versions.revision, false),
      'fullText', case when p_known_versions->>r.id::text is distinct from versions.revision and t.status = 'ready' then t.full_text else '' end,
      'segments', case when p_known_versions->>r.id::text is distinct from versions.revision and t.status = 'ready' then t.segments else '[]'::jsonb end
    ) row_data
    from public.test_response_versions r join public.test_responses response on response.id = r.response_id join public.submissions s on s.id = response.submission_id
    left join public.recording_transcripts t on t.version_id = r.id and t.owner_user_id = p_owner
      and t.source_bucket = r.recording_bucket and t.source_path = r.recording_path
    cross join lateral (select md5(jsonb_build_array(r.submitted_at, r.duration_seconds,
      r.recording_bucket, r.recording_path, t.updated_at, t.status, t.duration_ms, t.language)::text) as revision) versions
    where s.user_id = p_owner and s.id = (v_app->>'id')::uuid and r.recording_deleted_at is null
      and r.recording_bucket is not null and r.recording_path is not null and r.submitted_at <= p_as_of
      and (p_after_time is null or r.submitted_at < p_after_time or (r.submitted_at = p_after_time and r.id > p_after_id))
    order by r.submitted_at desc, r.id limit 51
  ) page;
  return jsonb_build_object('apps', v_apps, 'app', v_app, 'recordings', v_rows);
end;
$$;

-- Only the owner-authenticated Edge Function may supply the owner identity.
revoke all on function public.get_transcript_report_page_delta(uuid,uuid,timestamptz,timestamptz,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.get_transcript_report_page_delta(uuid,uuid,timestamptz,timestamptz,uuid,jsonb) to service_role;


create or replace function public.get_transcript_report_page(p_owner uuid, p_app uuid default null, p_as_of timestamptz default now(), p_after_time timestamptz default null, p_after_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.get_transcript_report_page_delta(p_owner, p_app, p_as_of, p_after_time, p_after_id, '{}'::jsonb);
$$;

-- Storage cleanup survives cascading account and response deletion.
create table public.recording_version_deletions (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique(bucket, path)
);
alter table public.recording_version_deletions enable row level security;
revoke all on public.recording_version_deletions from public, anon, authenticated;
grant all on public.recording_version_deletions to service_role;

update public.test_response_versions v set thumbnail_bucket = r.recording_thumbnail_bucket,
  thumbnail_path = r.recording_thumbnail_path from public.test_responses r where v.response_id = r.id;

create function private.sync_version_thumbnail() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.test_response_versions set thumbnail_bucket = new.thumbnail_storage_bucket,
    thumbnail_path = new.thumbnail_path
  where recording_bucket = new.storage_bucket and recording_path = new.object_key;
  return new;
end;
$$;
revoke all on function private.sync_version_thumbnail() from public, anon, authenticated;
create trigger sync_version_thumbnail after update of thumbnail_path, attached_response_id
on public.test_response_recording_uploads for each row execute function private.sync_version_thumbnail();

create function private.queue_version_media_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_source public.test_response_versions%rowtype;
begin
  if tg_op = 'DELETE' then v_source := old; else v_source := new; end if;
  if tg_op = 'DELETE' or new.recording_deleted_at is not null then
    if v_source.recording_bucket is not null and v_source.recording_path is not null then
      insert into public.recording_version_deletions(bucket,path) values(v_source.recording_bucket,v_source.recording_path)
      on conflict do nothing;
    end if;
    if v_source.thumbnail_bucket is not null and v_source.thumbnail_path is not null then
      insert into public.recording_version_deletions(bucket,path) values(v_source.thumbnail_bucket,v_source.thumbnail_path)
      on conflict do nothing;
    end if;
  end if;
  return old;
end;
$$;
revoke all on function private.queue_version_media_deletion() from public, anon, authenticated;
create trigger queue_version_media_deletion after delete or update of recording_deleted_at, thumbnail_bucket, thumbnail_path
on public.test_response_versions for each row execute function private.queue_version_media_deletion();

-- Retained legacy Supabase recordings remain protected after a response receives an R2 revision.
create or replace function public.list_stale_test_response_recording_drafts(p_limit integer default 100)
returns table (bucket_id text, object_name text)
language sql security definer set search_path = '' as $$
  select o.bucket_id::text, o.name::text from storage.objects o
  where o.bucket_id = 'test-response-recordings' and split_part(o.name, '/', 1) = 'draft'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.test_response_versions v
      where v.recording_bucket = o.bucket_id and v.recording_path = o.name and v.recording_deleted_at is null)
  order by o.created_at limit greatest(coalesce(p_limit, 100), 0);
$$;
revoke all on function public.list_stale_test_response_recording_drafts(integer) from public, anon, authenticated;
grant execute on function public.list_stale_test_response_recording_drafts(integer) to service_role;
drop policy if exists recording_drafts_delete_own on storage.objects;
create policy recording_drafts_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'test-response-recordings' and split_part(name, '/', 1) = 'draft'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and not exists (select 1 from public.test_response_versions v
    where v.recording_bucket = bucket_id and v.recording_path = name and v.recording_deleted_at is null));

-- Serialize newly pending disputes with revisions on the same logical response.
create function private.lock_pending_rating_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    perform 1 from public.test_responses where id = new.test_response_id for update;
    if not exists (select 1 from public.feedback_ratings f
      join public.test_responses r on r.id = f.test_response_id
      join public.submissions s on s.id = r.submission_id
      where f.test_response_id = new.test_response_id and f.rated_by_user_id = s.user_id
        and f.rating_value in ('neutral','frowny')) then
      raise exception 'This rating has changed. Reload your submitted feedback.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.lock_pending_rating_report() from public, anon, authenticated;
create trigger lock_pending_rating_report before insert or update of status
on public.feedback_rating_reports for each row execute function private.lock_pending_rating_report();

-- A delete claim wins before storage I/O, or waits for a submission and fails safely.
create function private.guard_recording_upload_attachment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception 'This recording draft was deleted. Start a new upload.';
  end if;
  if new.attached_response_id is not null and old.attached_response_id is null
    and (old.status <> 'completed' or new.status <> 'completed') then
    raise exception 'The recording upload is no longer available.';
  end if;
  if new.status = 'deleted' and new.attached_response_id is not null then
    raise exception 'Submitted recordings cannot be deleted as drafts.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_recording_upload_attachment() from public, anon, authenticated;
create trigger guard_recording_upload_attachment before update of status, attached_response_id
on public.test_response_recording_uploads for each row execute function private.guard_recording_upload_attachment();

create function private.queue_upload_media_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'deleted' then
    insert into public.recording_version_deletions(bucket,path) values(new.storage_bucket,new.object_key)
    on conflict do nothing;
    if new.thumbnail_storage_bucket is not null and new.thumbnail_path is not null then
      insert into public.recording_version_deletions(bucket,path) values(new.thumbnail_storage_bucket,new.thumbnail_path)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_upload_media_deletion() from public, anon, authenticated;
create trigger queue_upload_media_deletion after update of status, thumbnail_path
on public.test_response_recording_uploads for each row execute function private.queue_upload_media_deletion();
