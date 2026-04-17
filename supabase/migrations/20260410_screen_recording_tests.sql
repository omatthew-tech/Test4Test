alter table public.submissions
  add column if not exists requires_recording boolean not null default false;

alter table public.test_responses
  add column if not exists recording_bucket text,
  add column if not exists recording_path text,
  add column if not exists recording_file_name text,
  add column if not exists recording_mime_type text,
  add column if not exists recording_file_size_bytes bigint,
  add column if not exists recording_uploaded_at timestamptz,
  add column if not exists recording_expires_at timestamptz,
  add column if not exists recording_deleted_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'test-response-recordings',
  'test-response-recordings',
  false,
  524288000,
  array['video/mp4', 'video/quicktime', 'video/webm']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recording_drafts_insert_own" on storage.objects;
create policy "recording_drafts_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'test-response-recordings'
    and owner = auth.uid()
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[1] = 'draft'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "recording_drafts_select_own" on storage.objects;
create policy "recording_drafts_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'test-response-recordings'
    and owner = auth.uid()
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[1] = 'draft'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "recording_drafts_delete_own" on storage.objects;
create policy "recording_drafts_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'test-response-recordings'
    and owner = auth.uid()
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[1] = 'draft'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer);
drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, boolean, text, jsonb, integer);
create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_links jsonb,
  p_requires_recording boolean,
  p_question_mode text,
  p_questions jsonb,
  p_estimated_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_product_types text[];
  v_primary_product_type text;
  v_primary_access_url text;
  v_access_links jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a submission.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  if p_access_links is not null and jsonb_typeof(p_access_links) <> 'object' then
    raise exception 'Provide app links as a JSON object keyed by app type.';
  end if;

  select coalesce(
    array_agg(product_type order by array_position(array['website', 'ios', 'android']::text[], product_type)),
    array['website']::text[]
  )
  into v_product_types
  from (
    select distinct unnest(coalesce(p_product_types, array[]::text[])) as product_type
  ) normalized
  where product_type = any (array['website', 'ios', 'android']::text[]);

  if coalesce(cardinality(v_product_types), 0) = 0 then
    raise exception 'Select at least one app type.';
  end if;

  if exists (
    select 1
    from unnest(v_product_types) as product_type
    where nullif(trim(coalesce(p_access_links ->> product_type, '')), '') is null
  ) then
    raise exception 'Add a public link for each selected app type.';
  end if;

  select coalesce(
    jsonb_object_agg(product_type, access_url),
    '{}'::jsonb
  )
  into v_access_links
  from (
    select product_type, trim(p_access_links ->> product_type) as access_url
    from unnest(v_product_types) as product_type
  ) normalized_links;

  v_primary_product_type := v_product_types[1];
  v_primary_access_url := v_access_links ->> v_primary_product_type;

  insert into public.submissions (
    user_id,
    product_name,
    product_type,
    product_types,
    description,
    target_audience,
    instructions,
    access_url,
    access_method,
    access_links,
    requires_recording,
    status,
    question_mode,
    is_open_for_more_tests,
    estimated_minutes
  ) values (
    v_user_id,
    trim(p_product_name),
    v_primary_product_type,
    v_product_types,
    coalesce(p_description, ''),
    coalesce(p_target_audience, ''),
    coalesce(p_instructions, ''),
    v_primary_access_url,
    '',
    v_access_links,
    coalesce(p_requires_recording, false),
    'live',
    p_question_mode,
    true,
    greatest(coalesce(p_estimated_minutes, 5), 1)
  )
  returning id into v_submission_id;

  insert into public.submission_versions (
    submission_id,
    version_number,
    title,
    description,
    is_active
  ) values (
    v_submission_id,
    1,
    'Version 1',
    null,
    true
  );

  insert into public.question_set_versions (
    submission_id,
    version_number,
    is_active,
    mode,
    questions
  ) values (
    v_submission_id,
    1,
    true,
    p_question_mode,
    p_questions
  );

  return v_submission_id;
end;
$$;

drop function if exists public.submit_test_response(uuid, jsonb, integer);
drop function if exists public.submit_test_response(uuid, jsonb, integer, text, text);
create or replace function public.submit_test_response(
  p_submission_id uuid,
  p_answers jsonb,
  p_duration_seconds integer,
  p_recording_bucket text default null,
  p_recording_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.submissions%rowtype;
  v_submission_version public.submission_versions%rowtype;
  v_question_set public.question_set_versions%rowtype;
  v_response_id uuid;
  v_paragraph_count integer := 0;
  v_distinct_paragraph_count integer := 0;
  v_avg_paragraph_length numeric := 120;
  v_duplicate_penalty integer := 0;
  v_min_length_penalty integer := 0;
  v_duration_penalty integer := 0;
  v_quality_score integer := 0;
  v_flags text[] := '{}';
  v_credit_awarded boolean := false;
  v_status text := 'approved';
  v_message text;
  v_anonymous_label text;
  v_recording_bucket text := nullif(trim(coalesce(p_recording_bucket, '')), '');
  v_recording_path text := nullif(trim(coalesce(p_recording_path, '')), '');
  v_recording_owner uuid;
  v_recording_metadata jsonb := '{}'::jsonb;
  v_recording_file_name text;
  v_recording_mime_type text;
  v_recording_file_size_bytes bigint := 0;
  v_recording_uploaded_at timestamptz;
  v_recording_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Verify your email before completing tests.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select *
  into v_submission
  from public.submissions submissions
  where submissions.id = p_submission_id
    and submissions.status = 'live'
    and public.profile_is_clear(submissions.user_id);

  if not found then
    raise exception 'That test could not be loaded.';
  end if;

  if v_submission.user_id = v_user_id then
    raise exception 'You cannot test your own submission.';
  end if;

  if exists (
    select 1
    from public.test_responses responses
    where responses.submission_id = p_submission_id
      and responses.tester_user_id = v_user_id
  ) then
    raise exception 'You have already completed this test.';
  end if;

  if v_submission.requires_recording and (v_recording_bucket is null or v_recording_path is null) then
    raise exception 'Upload your screen recording before submitting this test.';
  end if;

  if v_recording_bucket is not null or v_recording_path is not null then
    if v_recording_bucket is null or v_recording_path is null then
      raise exception 'The recording upload is incomplete. Please upload it again.';
    end if;

    if v_recording_bucket <> 'test-response-recordings' then
      raise exception 'This recording upload bucket is not allowed.';
    end if;

    select
      objects.owner,
      coalesce(objects.metadata, '{}'::jsonb),
      objects.created_at
    into v_recording_owner, v_recording_metadata, v_recording_uploaded_at
    from storage.objects objects
    where objects.bucket_id = v_recording_bucket
      and objects.name = v_recording_path
    limit 1;

    if not found then
      raise exception 'The uploaded recording could not be found. Please upload it again.';
    end if;

    if split_part(v_recording_path, '/', 1) <> 'draft'
      or split_part(v_recording_path, '/', 2) <> v_user_id::text then
      raise exception 'You can only attach recordings you uploaded yourself.';
    end if;

    if v_recording_owner is not null and v_recording_owner <> v_user_id then
      raise exception 'You can only attach recordings you uploaded yourself.';
    end if;

    v_recording_file_name := regexp_replace(v_recording_path, '^.*/', '');
    v_recording_mime_type := coalesce(nullif(trim(v_recording_metadata ->> 'mimetype'), ''), 'video/mp4');
    v_recording_file_size_bytes := coalesce((v_recording_metadata ->> 'size')::bigint, 0);
    v_recording_expires_at := coalesce(v_recording_uploaded_at, timezone('utc', now())) + interval '7 days';
  end if;

  select *
  into v_submission_version
  from public.submission_versions versions
  where versions.submission_id = p_submission_id
    and versions.is_active = true
  order by versions.version_number desc
  limit 1;

  if not found then
    raise exception 'That app version is unavailable.';
  end if;

  select *
  into v_question_set
  from public.question_set_versions versions
  where versions.submission_id = p_submission_id
    and versions.is_active = true
  order by versions.version_number desc
  limit 1;

  if not found then
    raise exception 'That question set is unavailable.';
  end if;

  select
    count(*),
    count(distinct lower(trim(coalesce(item ->> 'textAnswer', '')))) filter (where trim(coalesce(item ->> 'textAnswer', '')) <> ''),
    coalesce(avg(length(trim(coalesce(item ->> 'textAnswer', '')))) filter (where trim(coalesce(item ->> 'textAnswer', '')) <> ''), 120)
  into v_paragraph_count, v_distinct_paragraph_count, v_avg_paragraph_length
  from jsonb_array_elements(p_answers) item
  where item ->> 'type' = 'paragraph';

  if exists (
    select 1
    from jsonb_array_elements(p_answers) item
    where item ->> 'type' = 'paragraph'
      and length(trim(coalesce(item ->> 'textAnswer', ''))) < 40
  ) then
    v_min_length_penalty := 18;
    v_flags := array_append(v_flags, 'Open-text responses are too short');
  end if;

  if v_paragraph_count > 0 and v_distinct_paragraph_count <> v_paragraph_count then
    v_duplicate_penalty := 22;
    v_flags := array_append(v_flags, 'Duplicate text detected');
  end if;

  if coalesce(p_duration_seconds, 0) < 150 then
    v_duration_penalty := 14;
    v_flags := array_append(v_flags, 'Finished unusually quickly');
  end if;

  v_quality_score := greatest(
    12,
    least(
      99,
      floor(48 + (v_avg_paragraph_length / 2.3) - v_duplicate_penalty - v_min_length_penalty - v_duration_penalty)
    )
  );

  v_credit_awarded := v_quality_score >= 55;
  v_status := case when v_credit_awarded then 'approved' else 'flagged' end;
  v_anonymous_label := format(
    'Tester %s',
    (select count(*) + 1 from public.test_responses responses where responses.submission_id = p_submission_id)
  );

  insert into public.test_responses (
    submission_id,
    submission_version_id,
    tester_user_id,
    question_set_version_id,
    anonymous_label,
    status,
    quality_score,
    credit_awarded,
    duration_seconds,
    answers,
    recording_bucket,
    recording_path,
    recording_file_name,
    recording_mime_type,
    recording_file_size_bytes,
    recording_uploaded_at,
    recording_expires_at,
    internal_flags
  ) values (
    p_submission_id,
    v_submission_version.id,
    v_user_id,
    v_question_set.id,
    v_anonymous_label,
    v_status,
    v_quality_score,
    v_credit_awarded,
    coalesce(p_duration_seconds, 0),
    p_answers,
    v_recording_bucket,
    v_recording_path,
    v_recording_file_name,
    v_recording_mime_type,
    v_recording_file_size_bytes,
    v_recording_uploaded_at,
    v_recording_expires_at,
    v_flags
  ) returning id into v_response_id;

  update public.submissions
  set response_count = response_count + 1,
      last_response_at = timezone('utc', now())
  where id = p_submission_id;

  if v_credit_awarded then
    insert into public.credit_transactions (
      user_id,
      type,
      amount,
      reason,
      related_test_response_id
    ) values (
      v_user_id,
      'earned_test',
      1,
      'Completed a usability test',
      v_response_id
    );

    v_message := 'Test submitted and credit awarded.';
  else
    v_message := 'Your submission was flagged for review. Please rewrite your responses to submit.';
  end if;

  return jsonb_build_object(
    'responseId', v_response_id,
    'ok', v_credit_awarded,
    'message', v_message,
    'status', v_status,
    'qualityScore', v_quality_score,
    'creditAwarded', v_credit_awarded
  );
end;
$$;

create or replace function public.list_stale_test_response_recording_drafts(
  p_limit integer default 100
)
returns table (
  bucket_id text,
  object_name text
)
language sql
security definer
set search_path = public, storage
as $$
  select
    objects.bucket_id::text,
    objects.name::text
  from storage.objects objects
  where objects.bucket_id = 'test-response-recordings'
    and split_part(objects.name, '/', 1) = 'draft'
    and objects.created_at < timezone('utc', now()) - interval '24 hours'
    and not exists (
      select 1
      from public.test_responses responses
      where responses.recording_bucket = objects.bucket_id
        and responses.recording_path = objects.name
        and responses.recording_deleted_at is null
    )
  order by objects.created_at asc
  limit greatest(coalesce(p_limit, 100), 0);
$$;

revoke all on function public.list_stale_test_response_recording_drafts(integer) from public;
grant execute on function public.list_stale_test_response_recording_drafts(integer) to service_role;
grant execute on function public.create_submission_with_questions(text, text[], text, text, text, jsonb, boolean, text, jsonb, integer) to authenticated;
grant execute on function public.submit_test_response(uuid, jsonb, integer, text, text) to authenticated;

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists vault;

create or replace function public.enqueue_cleanup_response_recordings()
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_project_url text;
  v_anon_key text;
  v_cleanup_secret text;
begin
  select decrypted_secret
  into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into v_anon_key
  from vault.decrypted_secrets
  where name = 'anon_key'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into v_cleanup_secret
  from vault.decrypted_secrets
  where name = 'recording_cleanup_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_project_url, '') = '' or coalesce(v_anon_key, '') = '' or coalesce(v_cleanup_secret, '') = '' then
    raise notice 'Skipping recording cleanup trigger because Vault secrets project_url, anon_key, or recording_cleanup_secret are missing.';
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/cleanup-response-recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'x-recording-cleanup-secret', v_cleanup_secret
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'triggered_at', timezone('utc', now())
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'cleanup-response-recordings-hourly'
  ) then
    perform cron.schedule(
      'cleanup-response-recordings-hourly',
      '0 * * * *',
      $job$select public.enqueue_cleanup_response_recordings();$job$
    );
  end if;
end;
$$;

revoke all on function public.enqueue_cleanup_response_recordings() from public;