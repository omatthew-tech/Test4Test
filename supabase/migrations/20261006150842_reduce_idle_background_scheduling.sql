-- Durable queues remain authoritative. pg_net starts requests only after commit;
-- a failed wakeup must never reject a saved message or recording.
create table private.background_dispatch_state (
  kind text primary key check (kind in ('transcripts', 'clips', 'chat')),
  requested_at timestamptz not null default '-infinity'
);
alter table private.background_dispatch_state enable row level security;
revoke all on private.background_dispatch_state from public, anon, authenticated, service_role;
insert into private.background_dispatch_state(kind) values ('transcripts'), ('clips'), ('chat');

create table private.background_scheduler_health (
  action text primary key check (action in ('recover', 'maintain')),
  last_success_at timestamptz not null,
  result jsonb not null
);
alter table private.background_scheduler_health enable row level security;
revoke all on private.background_scheduler_health from public, anon, authenticated, service_role;

create function private.request_background_dispatch(p_kind text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_request bigint; v_due boolean;
begin
  if p_kind = 'transcripts' then
    select exists(select 1 from public.recording_transcripts
      where (status = 'pending' and retry_after <= now() and attempt_count < 3)
         or (status = 'processing' and lease_expires_at < now())) into v_due;
  elsif p_kind = 'clips' then
    select exists(select 1 from public.recording_clips
      where (status = 'pending' and retry_after <= now())
         or (status = 'processing' and lease_expires_at < now())) into v_due;
  elsif p_kind = 'chat' then
    select exists(select 1 from public.chat_notification_outbox
      where (attempt_count < 5 and next_attempt_at <= now() and status in ('pending','failed'))
         or (status = 'processing' and lease_until < now())) into v_due;
  else raise exception 'Invalid background job';
  end if;
  if not v_due then return null; end if;
  -- Coalesce bursts without waiting on another user's transaction. Missed wakeups
  -- remain in the durable queue and are found by the external recovery schedule.
  if not pg_try_advisory_xact_lock(61006, case p_kind when 'transcripts' then 1 when 'clips' then 2 else 3 end)
    then return null; end if;
  update private.background_dispatch_state set requested_at = clock_timestamp()
    where kind = p_kind and requested_at < clock_timestamp() - interval '1 second';
  if not found then return null; end if;
  case p_kind
    when 'transcripts' then v_request := private.dispatch_recording_transcripts();
    when 'clips' then v_request := private.dispatch_recording_clips();
    when 'chat' then v_request := private.dispatch_chat_notifications();
  end case;
  return v_request;
exception when others then
  -- Subtransaction rolls back the dispatch timestamp/HTTP enqueue on failure.
  -- Do not put credentials, customer data or upstream errors into logs.
  raise warning 'Background dispatch deferred to recovery';
  return null;
end;
$$;
revoke all on function private.request_background_dispatch(text) from public, anon, authenticated;

create function private.wake_background_queue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'recording_transcripts' then
    if tg_op = 'INSERT' then
      if new.status = 'pending' then perform private.request_background_dispatch('transcripts'); end if;
    elsif (new.status = 'pending' and old.status = 'failed' and new.attempt_count = 0)
       or (old.status = 'processing' and new.status in ('ready','failed','pending')) then
      perform private.request_background_dispatch('transcripts');
    end if;
  elsif tg_table_name = 'recording_clips' then
    -- Save/retry already dispatches directly in the clip endpoint. Completion
    -- wakes remaining eligible work without waiting for the five-minute sweep.
    if old.status = 'processing' and new.status in ('ready','failed','pending') then
      perform private.request_background_dispatch('clips');
    end if;
  elsif tg_table_name = 'chat_notification_outbox' then
    if tg_op = 'INSERT' then
      if new.status = 'pending' and new.next_attempt_at <= now() then
        perform private.request_background_dispatch('chat');
      end if;
    elsif old.status = 'processing' and new.status in ('sent','cancelled','failed') then
      perform private.request_background_dispatch('chat');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.wake_background_queue() from public, anon, authenticated;
create trigger wake_transcript_queue after insert or update of status on public.recording_transcripts
  for each row execute function private.wake_background_queue();
create trigger wake_clip_queue after update of status on public.recording_clips
  for each row execute function private.wake_background_queue();
create trigger wake_chat_queue after insert or update of status on public.chat_notification_outbox
  for each row execute function private.wake_background_queue();

-- Reuse only the job actually being processed, never scan all legacy transcripts
-- on an idle timer. finish_recording_transcript rechecks ownership/source/lease.
create function public.reuse_claimed_recording_transcript(p_id uuid, p_attempt_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_job public.recording_transcripts; v_source jsonb; v_legacy record; v_result jsonb; v_newer boolean;
begin
  select * into v_job from public.recording_transcripts
    where id = p_id and attempt_id = p_attempt_id and status = 'processing' and attempt_count = 1;
  if not found then return false; end if;
  if nullif(to_jsonb(v_job)->>'version_id', '') is not null then
    execute 'select to_jsonb(v) from public.test_response_versions v where id = $1 and version_number = 1'
      into v_source using (to_jsonb(v_job)->>'version_id')::uuid;
  else
    select to_jsonb(r) into v_source from public.test_responses r where id = v_job.response_id;
  end if;
  if v_source is null or v_source->>'recording_deleted_at' is not null
    or v_source->>'recording_bucket' is distinct from v_job.source_bucket
    or v_source->>'recording_path' is distinct from v_job.source_path then return false; end if;
  select * into v_legacy from public.test_response_transcripts old
    where old.test_response_id = v_job.response_id and old.status = 'completed'
      and old.full_text is not null and nullif(old.provider, '') is not null and nullif(old.model, '') is not null
      and old.completed_at >= coalesce((v_source->>'recording_uploaded_at')::timestamptz,
        (v_source->>'submitted_at')::timestamptz)
    order by old.completed_at desc limit 1;
  if not found then return false; end if;
  if nullif(to_jsonb(v_job)->>'version_id', '') is not null then
    execute 'select exists(select 1 from public.test_response_versions where response_id=$1 and version_number>1 and submitted_at<=$2)'
      into v_newer using v_job.response_id, v_legacy.completed_at;
    if v_newer then return false; end if;
  end if;
  select jsonb_build_object('provider', v_legacy.provider, 'model', v_legacy.model,
    'fullText', v_legacy.full_text, 'language', v_legacy.language, 'durationMs', v_legacy.duration_ms,
    'segments', coalesce(jsonb_agg(jsonb_build_object('startMs', seg.start_ms, 'endMs', seg.end_ms,
      'text', seg.text, 'words', coalesce(seg.words, '[]'::jsonb)) order by seg.segment_index), '[]'::jsonb))
    into v_result from public.test_response_transcript_segments seg where seg.transcript_id = v_legacy.id;
  -- Both response-only and versioned deployments support these four arguments.
  return public.finish_recording_transcript(v_job.response_id, p_attempt_id, 'completed', v_result);
end;
$$;
revoke all on function public.reuse_claimed_recording_transcript(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reuse_claimed_recording_transcript(uuid,uuid) to service_role;

create function private.dispatch_recording_clip_cleanup() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' order by created_at desc limit 1' into v_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''transcript_dispatch_secret'' order by created_at desc limit 1' into v_secret;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{"action":"cleanup"}''::jsonb, timeout_milliseconds := 120000)'
    into v_request using rtrim(v_url,'/') || '/functions/v1/dispatch-recording-clips',
      jsonb_build_object('Content-Type','application/json','x-transcript-dispatch-secret',v_secret);
  return v_request;
end;
$$;
revoke all on function private.dispatch_recording_clip_cleanup() from public, anon, authenticated;

create function private.background_scheduler_tick(p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_deleted integer := 0; v_reused integer := 0;
begin
  if p_action = 'recover' then
    v_result := jsonb_build_object(
      'transcripts', private.request_background_dispatch('transcripts') is not null,
      'clips', private.request_background_dispatch('clips') is not null,
      'chat', private.request_background_dispatch('chat') is not null);
  elsif p_action = 'maintain' then
    -- Preserve running jobs and recent diagnostics. Bounded deletion avoids a
    -- one-off purge/VACUUM FULL spike on the constrained production instance.
    if to_regclass('cron.job_run_details') is not null then
      execute 'delete from cron.job_run_details where runid in (
        select runid from cron.job_run_details where end_time < now() - interval ''14 days''
          and status in (''succeeded'',''failed'') order by runid limit 500)';
      get diagnostics v_deleted = row_count;
    end if;
    -- Bounded compatibility pass for historical retained recordings. This is
    -- hourly, separate from dispatching new work. Existing claim backfill is
    -- retained for both supported schemas and called only when work is due.
    v_reused := public.reuse_existing_recording_transcripts(25);
    if to_regclass('public.test_response_versions') is not null and exists(
      select 1 from information_schema.columns where table_schema='public'
        and table_name='recording_transcripts' and column_name='version_id') then
      execute 'insert into public.recording_transcripts(response_id,version_id,owner_user_id,source_bucket,source_path)
        select r.response_id,r.id,s.user_id,r.recording_bucket,r.recording_path
        from public.test_response_versions r join public.test_responses response on response.id=r.response_id
        join public.submissions s on s.id=response.submission_id
        where r.recording_deleted_at is null and r.recording_bucket is not null and r.recording_path is not null
          and s.user_id is not null and not exists(select 1 from public.recording_transcripts t where t.version_id=r.id)
        order by r.submitted_at desc,r.id limit 25 on conflict(version_id) do nothing';
    else
      insert into public.recording_transcripts(response_id,owner_user_id,source_bucket,source_path)
        select r.id,s.user_id,r.recording_bucket,r.recording_path
        from public.test_responses r join public.submissions s on s.id=r.submission_id
        where r.recording_deleted_at is null and r.recording_bucket is not null and r.recording_path is not null
          and s.user_id is not null and not exists(select 1 from public.recording_transcripts t where t.response_id=r.id)
        order by r.submitted_at desc,r.id limit 25 on conflict(response_id) do nothing;
    end if;
    v_result := jsonb_build_object('historyDeleted',v_deleted,'legacyReused',v_reused,
      'cleanupDispatched',private.dispatch_recording_clip_cleanup() is not null);
  else raise exception 'Invalid scheduler action';
  end if;
  insert into private.background_scheduler_health(action,last_success_at,result)
    values(p_action,clock_timestamp(),v_result)
    on conflict(action) do update set last_success_at=excluded.last_success_at,result=excluded.result;
  return v_result;
end;
$$;
revoke all on function private.background_scheduler_tick(text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.background_scheduler_tick(text) to service_role;
create function public.background_scheduler_tick(p_action text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.background_scheduler_tick(p_action); $$;
revoke all on function public.background_scheduler_tick(text) from public, anon, authenticated;
grant execute on function public.background_scheduler_tick(text) to service_role;

-- Keep existing cron jobs active during the staged rollout. A separate cutover
-- migration disables them only after the external scheduler is verified.
