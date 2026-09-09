-- Reuse completed transcripts from the previous report pipeline only while their
-- source is still current. This avoids retranscribing the same retained media.
create function public.reuse_existing_recording_transcripts(
  p_limit integer default 25, p_owner uuid default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_record record; v_job public.recording_transcripts%rowtype; v_count integer := 0; v_result jsonb;
begin
  for v_record in
    select r.id response_id, r.recording_bucket, r.recording_path, s.user_id owner_id,
      old.id legacy_id, old.full_text, old.provider, old.model, old.language,
      old.duration_ms, old.completed_at
    from public.test_responses r
    join public.submissions s on s.id = r.submission_id
    join public.test_response_transcripts old on old.test_response_id = r.id
    left join public.recording_transcripts current on current.response_id = r.id
    where old.status = 'completed' and old.full_text is not null
      and nullif(old.provider, '') is not null and nullif(old.model, '') is not null
      and old.completed_at >= coalesce(r.recording_uploaded_at, r.submitted_at)
      and r.recording_deleted_at is null and r.recording_bucket is not null and r.recording_path is not null
      and (p_owner is null or s.user_id = p_owner)
      and (current.id is null or (current.status = 'pending' and current.attempt_count = 0))
    order by old.completed_at, r.id limit greatest(1, least(p_limit, 25))
    for update of r skip locked
  loop
    insert into public.recording_transcripts(response_id, owner_user_id, source_bucket, source_path)
    values(v_record.response_id, v_record.owner_id, v_record.recording_bucket, v_record.recording_path)
    on conflict (response_id) do nothing;
    select * into v_job from public.recording_transcripts where response_id = v_record.response_id for update;
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
revoke all on function public.reuse_existing_recording_transcripts(integer, uuid) from public, anon, authenticated;
grant execute on function public.reuse_existing_recording_transcripts(integer, uuid) to service_role;
