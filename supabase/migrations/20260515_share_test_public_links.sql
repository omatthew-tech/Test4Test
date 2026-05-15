alter table public.test_responses
  alter column tester_user_id drop not null,
  add column if not exists public_tester_key text;

alter table public.test_responses
  drop constraint if exists test_responses_tester_identity_present,
  drop constraint if exists test_responses_public_tester_key_length;

alter table public.test_responses
  add constraint test_responses_tester_identity_present
  check (
    tester_user_id is not null
    or nullif(trim(coalesce(public_tester_key, '')), '') is not null
  ),
  add constraint test_responses_public_tester_key_length
  check (
    public_tester_key is null
    or length(trim(public_tester_key)) between 16 and 128
  );

create unique index if not exists test_responses_submission_public_tester_key_key
  on public.test_responses (submission_id, public_tester_key)
  where public_tester_key is not null;

drop function if exists public.submit_public_test_response(uuid, jsonb, integer, text, uuid, uuid);
create or replace function public.submit_public_test_response(
  p_submission_id uuid,
  p_answers jsonb,
  p_duration_seconds integer,
  p_public_tester_key text,
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
  v_public_tester_key text := nullif(trim(coalesce(p_public_tester_key, '')), '');
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
  v_status text := 'approved';
  v_anonymous_label text;
begin
  if v_public_tester_key is null then
    raise exception 'This shared test needs a browser identity before submitting.';
  end if;

  if length(v_public_tester_key) < 16 or length(v_public_tester_key) > 128 then
    raise exception 'This shared test browser identity is invalid.';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be submitted as a JSON array.';
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

  if v_user_id is not null and v_submission.user_id = v_user_id then
    raise exception 'You cannot test your own submission.';
  end if;

  if v_submission.requires_recording then
    raise exception 'This shared test requires a signed-in screen recording.';
  end if;

  if exists (
    select 1
    from public.test_responses responses
    where responses.submission_id = p_submission_id
      and responses.public_tester_key = v_public_tester_key
  ) then
    raise exception 'You have already completed this shared test on this browser.';
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

  v_status := case when v_quality_score >= 55 then 'approved' else 'flagged' end;
  v_anonymous_label := format(
    'Tester %s',
    (select count(*) + 1 from public.test_responses responses where responses.submission_id = p_submission_id)
  );

  insert into public.test_responses (
    submission_id,
    submission_version_id,
    tester_user_id,
    public_tester_key,
    question_set_version_id,
    anonymous_label,
    status,
    quality_score,
    credit_awarded,
    duration_seconds,
    answers,
    internal_flags
  ) values (
    p_submission_id,
    v_submission_version.id,
    null,
    v_public_tester_key,
    v_question_set.id,
    v_anonymous_label,
    v_status,
    v_quality_score,
    false,
    coalesce(p_duration_seconds, 0),
    p_answers,
    v_flags
  ) returning id into v_response_id;

  update public.submissions
  set response_count = response_count + 1,
      last_response_at = timezone('utc', now())
  where id = p_submission_id;

  return jsonb_build_object(
    'responseId', v_response_id,
    'ok', true,
    'message', 'Feedback submitted. Thanks for sharing your thoughts.',
    'status', v_status,
    'qualityScore', v_quality_score,
    'creditAwarded', false
  );
end;
$$;

grant execute on function public.submit_public_test_response(uuid, jsonb, integer, text, uuid, uuid) to anon, authenticated;

create or replace function public.enqueue_new_feedback_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url text;
  v_reminder_secret text;
begin
  if new.status <> 'approved'
     or (
       not coalesce(new.credit_awarded, false)
       and nullif(trim(coalesce(new.public_tester_key, '')), '') is null
     )
     or new.owner_notified_at is not null then
    return new;
  end if;

  select decrypted_secret
  into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into v_reminder_secret
  from vault.decrypted_secrets
  where name = 'test_back_reminder_cron_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_project_url, '') = '' or coalesce(v_reminder_secret, '') = '' then
    raise notice 'Skipping new feedback notification because Vault secrets project_url or test_back_reminder_cron_secret are missing.';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/send-test-results-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', v_reminder_secret
    ),
    body := jsonb_build_object(
      'responseId', new.id,
      'source', 'database_trigger'
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;
