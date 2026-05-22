alter table public.submissions
  add column if not exists needs_google_play_closed_testers boolean not null default false;

create index if not exists submissions_google_play_closed_test_pool_idx
  on public.submissions (user_id, status, needs_google_play_closed_testers);

alter table public.submissions
  drop constraint if exists submissions_google_play_closed_test_android_only;

alter table public.submissions
  add constraint submissions_google_play_closed_test_android_only
  check (
    needs_google_play_closed_testers = false
    or product_types = array['android']::text[]
  );

drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, boolean, text, jsonb, integer);
create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_links jsonb,
  p_requires_recording boolean,
  p_needs_google_play_closed_testers boolean,
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

  if coalesce(p_needs_google_play_closed_testers, false)
     and v_product_types <> array['android']::text[] then
    raise exception 'Google Play closed-test matching requires an Android-only submission.';
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
    needs_google_play_closed_testers,
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
    coalesce(p_needs_google_play_closed_testers, false),
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

grant execute on function public.create_submission_with_questions(text, text[], text, text, text, jsonb, boolean, boolean, text, jsonb, integer) to authenticated;

create or replace function public.find_test_back_target_submission(
  p_tester_user_id uuid,
  p_owner_user_id uuid
)
returns table (
  submission_id uuid,
  product_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with owner_pool as (
    select exists (
      select 1
      from public.submissions owner_submissions
      where owner_submissions.user_id = p_owner_user_id
        and owner_submissions.status = 'live'
        and owner_submissions.needs_google_play_closed_testers = true
    ) as needs_google_play_closed_testers
  ),
  tester_pool as (
    select exists (
      select 1
      from public.submissions tester_submissions
      where tester_submissions.user_id = p_tester_user_id
        and tester_submissions.status = 'live'
        and tester_submissions.needs_google_play_closed_testers = true
    ) as needs_google_play_closed_testers
  )
  select
    submissions.id,
    submissions.product_name
  from public.submissions submissions
  cross join owner_pool
  cross join tester_pool
  where tester_pool.needs_google_play_closed_testers = owner_pool.needs_google_play_closed_testers
    and submissions.user_id = p_tester_user_id
    and submissions.status = 'live'
    and submissions.is_open_for_more_tests = true
    and submissions.needs_google_play_closed_testers = owner_pool.needs_google_play_closed_testers
    and public.profile_is_clear(submissions.user_id)
    and not exists (
      select 1
      from public.test_responses responses
      where responses.submission_id = submissions.id
        and responses.tester_user_id = p_owner_user_id
        and responses.status = 'approved'
        and responses.credit_awarded = true
    )
  order by
    submissions.promoted desc,
    submissions.response_count asc,
    submissions.created_at desc
  limit 1;
$$;
