create table if not exists public.test_response_recording_uploads (
  id uuid primary key default gen_random_uuid(),
  tester_user_id uuid not null references public.profiles (id) on delete cascade,
  storage_provider text not null default 'r2' check (storage_provider = 'r2'),
  storage_bucket text not null,
  object_key text not null,
  upload_mode text not null check (upload_mode in ('single', 'multipart')),
  upload_id text,
  status text not null default 'pending' check (status in ('pending', 'uploading', 'completed', 'aborted', 'deleted')),
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0 and file_size_bytes <= 524288000),
  uploaded_at timestamptz,
  expires_at timestamptz,
  attached_response_id uuid references public.test_responses (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (storage_bucket, object_key)
);

alter table public.test_response_recording_uploads enable row level security;

drop function if exists public.submit_test_response(uuid, jsonb, integer, text, text, uuid, uuid);
create or replace function public.submit_test_response(
  p_submission_id uuid,
  p_answers jsonb,
  p_duration_seconds integer,
  p_recording_bucket text default null,
  p_recording_path text default null,
  p_question_set_version_id uuid default null,
  p_submission_version_id uuid default null
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
  v_is_r2_recording boolean := false;
  v_r2_upload public.test_response_recording_uploads%rowtype;
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

    if v_recording_bucket = 'test-response-recordings' then
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
    elsif v_recording_bucket = 'r2:test-response-recordings' then
      select *
      into v_r2_upload
      from public.test_response_recording_uploads uploads
      where uploads.storage_provider = 'r2'
        and uploads.storage_bucket = v_recording_bucket
        and uploads.object_key = v_recording_path
        and uploads.tester_user_id = v_user_id
        and uploads.status = 'completed'
        and uploads.attached_response_id is null
      limit 1;

      if not found then
        raise exception 'The uploaded recording could not be found. Please upload it again.';
      end if;

      if split_part(v_recording_path, '/', 1) <> 'draft'
        or split_part(v_recording_path, '/', 2) <> v_user_id::text then
        raise exception 'You can only attach recordings you uploaded yourself.';
      end if;

      v_is_r2_recording := true;
      v_recording_file_name := v_r2_upload.file_name;
      v_recording_mime_type := v_r2_upload.mime_type;
      v_recording_file_size_bytes := v_r2_upload.file_size_bytes;
      v_recording_uploaded_at := coalesce(v_r2_upload.uploaded_at, v_r2_upload.updated_at, timezone('utc', now()));
      v_recording_expires_at := coalesce(v_r2_upload.expires_at, v_recording_uploaded_at + interval '7 days');
    else
      raise exception 'This recording upload bucket is not allowed.';
    end if;
  end if;

  if p_submission_version_id is not null then
    select *
    into v_submission_version
    from public.submission_versions versions
    where versions.id = p_submission_version_id
      and versions.submission_id = p_submission_id
    limit 1;
  else
    select *
    into v_submission_version
    from public.submission_versions versions
    where versions.submission_id = p_submission_id
      and versions.is_active = true
    order by versions.version_number desc
    limit 1;
  end if;

  if not found then
    raise exception 'That app version is unavailable.';
  end if;

  if p_question_set_version_id is not null then
    select *
    into v_question_set
    from public.question_set_versions versions
    where versions.id = p_question_set_version_id
      and versions.submission_id = p_submission_id
    limit 1;
  else
    select *
    into v_question_set
    from public.question_set_versions versions
    where versions.submission_id = p_submission_id
      and versions.is_active = true
    order by versions.version_number desc
    limit 1;
  end if;

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

  if v_is_r2_recording then
    update public.test_response_recording_uploads
    set attached_response_id = v_response_id,
        updated_at = timezone('utc', now())
    where id = v_r2_upload.id
      and attached_response_id is null;
  end if;

  delete from public.test_response_drafts drafts
  where drafts.submission_id = p_submission_id
    and drafts.tester_user_id = v_user_id;

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

grant execute on function public.submit_test_response(uuid, jsonb, integer, text, text, uuid, uuid) to authenticated;
