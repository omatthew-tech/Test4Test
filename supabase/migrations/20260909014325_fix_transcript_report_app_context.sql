-- Read structured tasks when present, while supporting the retained legacy instructions schema.
create or replace function public.get_transcript_report_page(
  p_owner uuid, p_app uuid default null, p_as_of timestamptz default now(),
  p_after_time timestamptz default null, p_after_id uuid default null
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
