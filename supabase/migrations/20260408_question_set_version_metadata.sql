create table if not exists public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  version_number integer not null,
  title text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default true,
  unique (submission_id, version_number)
);

alter table public.submission_versions enable row level security;

alter table public.test_responses
  add column if not exists submission_version_id uuid references public.submission_versions (id) on delete cascade;

insert into public.submission_versions (
  submission_id,
  version_number,
  title,
  description,
  created_at,
  is_active
)
select
  submissions.id,
  1,
  'Version 1',
  null,
  submissions.created_at,
  true
from public.submissions submissions
where not exists (
  select 1
  from public.submission_versions versions
  where versions.submission_id = submissions.id
);

update public.test_responses responses
set submission_version_id = versions.id
from public.submission_versions versions
where responses.submission_id = versions.submission_id
  and versions.version_number = 1
  and responses.submission_version_id is null;

alter table public.test_responses
  alter column submission_version_id set not null;

drop policy if exists "submission_versions_select_live_or_own" on public.submission_versions;
create policy "submission_versions_select_live_or_own"
  on public.submission_versions for select
  using (
    public.current_user_has_app_access()
    and (
      exists (
        select 1
        from public.submissions submissions
        where submissions.id = submission_versions.submission_id
          and submissions.user_id = auth.uid()
      )
      or (
        submission_versions.is_active = true
        and exists (
          select 1
          from public.submissions submissions
          where submissions.id = submission_versions.submission_id
            and submissions.status = 'live'
            and public.profile_is_clear(submissions.user_id)
        )
        and not exists (
          select 1
          from public.test_responses responses
          where responses.submission_id = submission_versions.submission_id
            and responses.tester_user_id = auth.uid()
        )
      )
      or exists (
        select 1
        from public.test_responses responses
        where responses.submission_version_id = submission_versions.id
          and responses.tester_user_id = auth.uid()
      )
    )
  );

drop policy if exists "submission_versions_insert_own" on public.submission_versions;
create policy "submission_versions_insert_own"
  on public.submission_versions for insert
  with check (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = submission_versions.submission_id
        and submissions.user_id = auth.uid()
    )
  );

drop policy if exists "submission_versions_update_own" on public.submission_versions;
create policy "submission_versions_update_own"
  on public.submission_versions for update
  using (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = submission_versions.submission_id
        and submissions.user_id = auth.uid()
    )
  )
  with check (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = submission_versions.submission_id
        and submissions.user_id = auth.uid()
    )
  );

drop policy if exists "question_sets_select_live_or_own" on public.question_set_versions;
create policy "question_sets_select_live_or_own"
  on public.question_set_versions for select
  using (
    public.current_user_has_app_access()
    and (
      exists (
        select 1
        from public.submissions submissions
        where submissions.id = question_set_versions.submission_id
          and submissions.user_id = auth.uid()
      )
      or (
        question_set_versions.is_active = true
        and exists (
          select 1
          from public.submissions submissions
          where submissions.id = question_set_versions.submission_id
            and submissions.status = 'live'
            and public.profile_is_clear(submissions.user_id)
        )
        and not exists (
          select 1
          from public.test_responses responses
          where responses.submission_id = question_set_versions.submission_id
            and responses.tester_user_id = auth.uid()
        )
      )
      or exists (
        select 1
        from public.test_responses responses
        where responses.question_set_version_id = question_set_versions.id
          and responses.tester_user_id = auth.uid()
      )
    )
  );

drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer);
create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_links jsonb,
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

drop function if exists public.create_submission_version(uuid, text, text);
create or replace function public.create_submission_version(
  p_submission_id uuid,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_version integer;
  v_submission_version_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a version.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  if v_title = '' then
    raise exception 'Add a version title.';
  end if;

  if not exists (
    select 1
    from public.submissions submissions
    where submissions.id = p_submission_id
      and submissions.user_id = v_user_id
  ) then
    raise exception 'You do not have access to update this submission.';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.submission_versions
  where submission_id = p_submission_id;

  update public.submission_versions
  set is_active = false
  where submission_id = p_submission_id
    and is_active = true;

  insert into public.submission_versions (
    submission_id,
    version_number,
    title,
    description,
    is_active
  ) values (
    p_submission_id,
    v_next_version,
    v_title,
    v_description,
    true
  ) returning id into v_submission_version_id;

  return v_submission_version_id;
end;
$$;

drop function if exists public.update_question_set(uuid, text, jsonb, integer);
drop function if exists public.update_question_set(uuid, uuid, text, jsonb, integer);
create or replace function public.update_question_set(
  p_submission_id uuid,
  p_question_set_version_id uuid,
  p_mode text,
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
  v_current_question_set public.question_set_versions%rowtype;
  v_next_version integer;
  v_question_set_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update questions.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select versions.*
  into v_current_question_set
  from public.question_set_versions versions
  join public.submissions submissions
    on submissions.id = versions.submission_id
  where submissions.id = p_submission_id
    and submissions.user_id = v_user_id
    and versions.id = p_question_set_version_id
  limit 1;

  if not found then
    raise exception 'You do not have access to update this question set.';
  end if;

  if not v_current_question_set.is_active then
    raise exception 'Only the latest question set can be edited.';
  end if;

  update public.question_set_versions
  set is_active = false
  where submission_id = p_submission_id
    and is_active = true;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.question_set_versions
  where submission_id = p_submission_id;

  insert into public.question_set_versions (
    submission_id,
    version_number,
    is_active,
    mode,
    questions
  ) values (
    p_submission_id,
    v_next_version,
    true,
    p_mode,
    p_questions
  ) returning id into v_question_set_id;

  update public.submissions
  set question_mode = p_mode,
      estimated_minutes = greatest(coalesce(p_estimated_minutes, estimated_minutes), 1)
  where id = p_submission_id;

  return v_question_set_id;
end;
$$;

drop function if exists public.submit_test_response(uuid, jsonb, integer);
create or replace function public.submit_test_response(
  p_submission_id uuid,
  p_answers jsonb,
  p_duration_seconds integer
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

grant execute on function public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer) to authenticated;
grant execute on function public.create_submission_version(uuid, text, text) to authenticated;
grant execute on function public.update_question_set(uuid, uuid, text, jsonb, integer) to authenticated;
grant execute on function public.submit_test_response(uuid, jsonb, integer) to authenticated;
