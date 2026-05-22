alter table public.submissions
  add column if not exists google_play_closed_test_instructions text not null default '';

update public.submissions
set google_play_closed_test_instructions = 'Use the Google Play testing link above to join the closed test, then open the app daily for 14 consecutive days.'
where needs_google_play_closed_testers = true
  and length(trim(coalesce(google_play_closed_test_instructions, ''))) = 0;

alter table public.submissions
  drop constraint if exists submissions_google_play_closed_test_instructions_present;

alter table public.submissions
  add constraint submissions_google_play_closed_test_instructions_present
  check (
    needs_google_play_closed_testers = false
    or length(trim(coalesce(google_play_closed_test_instructions, ''))) > 0
  );

create table if not exists public.google_play_closed_test_participations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  tester_user_id uuid not null references public.profiles (id) on delete cascade,
  founder_user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null default 1,
  started_on date not null default (timezone('utc', now())::date),
  status text not null default 'active' check (status in ('active', 'completed', 'missed', 'cancelled')),
  required_days integer not null default 14 check (required_days = 14),
  completed_at timestamptz,
  missed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (submission_id, tester_user_id, attempt_number),
  check (tester_user_id <> founder_user_id)
);

create unique index if not exists google_play_closed_test_participations_one_active_idx
  on public.google_play_closed_test_participations (submission_id, tester_user_id)
  where status = 'active';

create index if not exists google_play_closed_test_participations_tester_idx
  on public.google_play_closed_test_participations (tester_user_id, status, started_on desc);

create index if not exists google_play_closed_test_participations_founder_idx
  on public.google_play_closed_test_participations (founder_user_id, status, started_on desc);

create table if not exists public.google_play_closed_test_check_ins (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.google_play_closed_test_participations (id) on delete cascade,
  check_in_date date not null default (timezone('utc', now())::date),
  created_at timestamptz not null default timezone('utc', now()),
  unique (participation_id, check_in_date)
);

create index if not exists google_play_closed_test_check_ins_participation_idx
  on public.google_play_closed_test_check_ins (participation_id, check_in_date);

alter table public.google_play_closed_test_participations enable row level security;
alter table public.google_play_closed_test_check_ins enable row level security;

drop policy if exists "google_play_closed_test_participations_select_related" on public.google_play_closed_test_participations;
create policy "google_play_closed_test_participations_select_related"
  on public.google_play_closed_test_participations for select
  using (auth.uid() = tester_user_id or auth.uid() = founder_user_id);

drop policy if exists "google_play_closed_test_check_ins_select_related" on public.google_play_closed_test_check_ins;
create policy "google_play_closed_test_check_ins_select_related"
  on public.google_play_closed_test_check_ins for select
  using (
    exists (
      select 1
      from public.google_play_closed_test_participations participations
      where participations.id = google_play_closed_test_check_ins.participation_id
        and (
          participations.tester_user_id = auth.uid()
          or participations.founder_user_id = auth.uid()
        )
    )
  );

create or replace function public.user_is_google_play_closed_test_pool(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.submissions submissions
    where submissions.user_id = p_user_id
      and submissions.status = 'live'
      and submissions.needs_google_play_closed_testers = true
      and public.profile_is_clear(submissions.user_id)
  );
$$;

create or replace function public.mark_missed_google_play_closed_tests(
  p_reference_date date default (timezone('utc', now())::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  with stale_participations as (
    select participations.id
    from public.google_play_closed_test_participations participations
    left join lateral (
      select max(check_ins.check_in_date) as latest_check_in_date
      from public.google_play_closed_test_check_ins check_ins
      where check_ins.participation_id = participations.id
    ) latest on true
    where participations.status = 'active'
      and coalesce(latest.latest_check_in_date, participations.started_on) < p_reference_date - 1
  ),
  updated as (
    update public.google_play_closed_test_participations participations
    set status = 'missed',
        missed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    from stale_participations
    where participations.id = stale_participations.id
    returning participations.id
  )
  select count(*) into v_updated from updated;

  return v_updated;
end;
$$;

drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, boolean, boolean, text, jsonb, integer);
create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_links jsonb,
  p_requires_recording boolean,
  p_needs_google_play_closed_testers boolean,
  p_google_play_closed_test_instructions text,
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
  v_google_play_closed_test_instructions text := trim(coalesce(p_google_play_closed_test_instructions, ''));
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

  if coalesce(p_needs_google_play_closed_testers, false)
     and length(v_google_play_closed_test_instructions) = 0 then
    raise exception 'Add Google Play closed-test access instructions for testers.';
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
    google_play_closed_test_instructions,
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
    case when coalesce(p_needs_google_play_closed_testers, false) then v_google_play_closed_test_instructions else '' end,
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

grant execute on function public.create_submission_with_questions(text, text[], text, text, text, jsonb, boolean, boolean, text, text, jsonb, integer) to authenticated;

create or replace function public.list_earn_submissions(
  p_product_types text[]
)
returns table (
  id uuid,
  user_id uuid,
  product_name text,
  product_type text,
  product_types text[],
  description text,
  target_audience text,
  instructions text,
  google_play_closed_test_instructions text,
  access_url text,
  access_method text,
  access_links jsonb,
  requires_recording boolean,
  needs_google_play_closed_testers boolean,
  status text,
  question_mode text,
  is_open_for_more_tests boolean,
  estimated_minutes integer,
  response_count integer,
  last_response_at timestamptz,
  promoted boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_types text[];
  v_needs_google_play_closed_testers boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in to browse Earn tests.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select coalesce(
    array_agg(product_type order by array_position(array['website', 'ios', 'android']::text[], product_type)),
    array[]::text[]
  )
  into v_product_types
  from (
    select distinct unnest(coalesce(p_product_types, array[]::text[])) as product_type
  ) normalized
  where product_type = any (array['website', 'ios', 'android']::text[]);

  if cardinality(v_product_types) = 0 then
    return;
  end if;

  v_needs_google_play_closed_testers := public.user_is_google_play_closed_test_pool(v_user_id);

  return query
  select
    submissions.id,
    submissions.user_id,
    submissions.product_name,
    submissions.product_type,
    coalesce(submissions.product_types, array[submissions.product_type]),
    submissions.description,
    submissions.target_audience,
    submissions.instructions,
    submissions.google_play_closed_test_instructions,
    submissions.access_url,
    submissions.access_method,
    submissions.access_links,
    submissions.requires_recording,
    submissions.needs_google_play_closed_testers,
    submissions.status,
    submissions.question_mode,
    submissions.is_open_for_more_tests,
    submissions.estimated_minutes,
    submissions.response_count,
    submissions.last_response_at,
    coalesce(submissions.promoted, false),
    submissions.created_at
  from public.submissions submissions
  where submissions.status = 'live'
    and submissions.user_id <> v_user_id
    and submissions.is_open_for_more_tests = true
    and submissions.needs_google_play_closed_testers = v_needs_google_play_closed_testers
    and public.profile_is_clear(submissions.user_id)
    and coalesce(submissions.product_types, array[submissions.product_type]) && v_product_types
    and not exists (
      select 1
      from public.test_responses responses
      where responses.submission_id = submissions.id
        and responses.tester_user_id = v_user_id
    )
  order by
    coalesce(submissions.promoted, false) desc,
    submissions.response_count asc,
    submissions.created_at desc;
end;
$$;

grant execute on function public.list_earn_submissions(text[]) to authenticated;

create or replace function public.start_google_play_closed_test_participation(
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.submissions%rowtype;
  v_participation public.google_play_closed_test_participations%rowtype;
  v_today date := timezone('utc', now())::date;
  v_next_attempt_number integer;
begin
  if v_user_id is null then
    raise exception 'Sign in to join this Google Play closed test.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  perform public.mark_missed_google_play_closed_tests(v_today);

  select *
  into v_submission
  from public.submissions submissions
  where submissions.id = p_submission_id
    and submissions.status = 'live'
    and public.profile_is_clear(submissions.user_id);

  if not found then
    raise exception 'That closed test could not be loaded.';
  end if;

  if v_submission.user_id = v_user_id then
    raise exception 'You cannot join your own closed test.';
  end if;

  if v_submission.needs_google_play_closed_testers is not true then
    raise exception 'This app is not enrolled in Google Play closed-test matching.';
  end if;

  if not public.user_is_google_play_closed_test_pool(v_user_id) then
    raise exception 'Only Google Play closed-test founders can join this closed-test pool.';
  end if;

  select *
  into v_participation
  from public.google_play_closed_test_participations participations
  where participations.submission_id = p_submission_id
    and participations.tester_user_id = v_user_id
    and participations.status in ('active', 'completed')
  order by participations.created_at desc
  limit 1;

  if found then
    insert into public.google_play_closed_test_check_ins (participation_id, check_in_date)
    values (v_participation.id, v_today)
    on conflict (participation_id, check_in_date) do nothing;

    return jsonb_build_object(
      'participationId', v_participation.id,
      'status', v_participation.status,
      'message', case
        when v_participation.status = 'completed' then 'This closed test is already complete.'
        else 'You are already joined. Today is checked in.'
      end
    );
  end if;

  select coalesce(max(participations.attempt_number), 0) + 1
  into v_next_attempt_number
  from public.google_play_closed_test_participations participations
  where participations.submission_id = p_submission_id
    and participations.tester_user_id = v_user_id;

  insert into public.google_play_closed_test_participations (
    submission_id,
    tester_user_id,
    founder_user_id,
    attempt_number,
    started_on,
    status
  ) values (
    p_submission_id,
    v_user_id,
    v_submission.user_id,
    v_next_attempt_number,
    v_today,
    'active'
  )
  returning * into v_participation;

  insert into public.google_play_closed_test_check_ins (participation_id, check_in_date)
  values (v_participation.id, v_today)
  on conflict (participation_id, check_in_date) do nothing;

  return jsonb_build_object(
    'participationId', v_participation.id,
    'status', v_participation.status,
    'message', 'You joined this Google Play closed test. Day 1 is checked in.'
  );
end;
$$;

grant execute on function public.start_google_play_closed_test_participation(uuid) to authenticated;

create or replace function public.record_google_play_closed_test_check_in(
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
  v_participation public.google_play_closed_test_participations%rowtype;
  v_check_in_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in to check in for this Google Play closed test.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  perform public.mark_missed_google_play_closed_tests(v_today);

  select *
  into v_participation
  from public.google_play_closed_test_participations participations
  where participations.submission_id = p_submission_id
    and participations.tester_user_id = v_user_id
    and participations.status in ('active', 'completed')
  order by participations.created_at desc
  limit 1;

  if not found then
    raise exception 'Join this Google Play closed test before checking in.';
  end if;

  if v_participation.status = 'completed' then
    return jsonb_build_object(
      'participationId', v_participation.id,
      'status', v_participation.status,
      'message', 'This 14-day closed test is already complete.'
    );
  end if;

  insert into public.google_play_closed_test_check_ins (participation_id, check_in_date)
  values (v_participation.id, v_today)
  on conflict (participation_id, check_in_date) do nothing;

  select count(*)
  into v_check_in_count
  from public.google_play_closed_test_check_ins check_ins
  where check_ins.participation_id = v_participation.id
    and check_ins.check_in_date between v_participation.started_on and v_participation.started_on + (v_participation.required_days - 1);

  if v_check_in_count >= v_participation.required_days then
    update public.google_play_closed_test_participations
    set status = 'completed',
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = v_participation.id
    returning * into v_participation;

    return jsonb_build_object(
      'participationId', v_participation.id,
      'status', v_participation.status,
      'message', 'Closed test completed. Thanks for finishing the 14-day commitment.'
    );
  end if;

  update public.google_play_closed_test_participations
  set updated_at = timezone('utc', now())
  where id = v_participation.id;

  return jsonb_build_object(
    'participationId', v_participation.id,
    'status', 'active',
    'checkIns', v_check_in_count,
    'message', format('Day %s of 14 checked in.', v_check_in_count)
  );
end;
$$;

grant execute on function public.record_google_play_closed_test_check_in(uuid) to authenticated;

drop function if exists public.get_my_submitted_feedback_cards();
create or replace function public.get_my_submitted_feedback_cards()
returns table (
  response_id uuid,
  submission_id uuid,
  product_name text,
  product_types text[],
  description text,
  needs_google_play_closed_testers boolean,
  submitted_at timestamptz,
  rating_value text,
  owner_test_back_rate_percent integer,
  owner_satisfaction_rate_percent integer,
  submission_status text,
  report_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to load submitted feedback.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  return query
  with authored_responses as (
    select
      responses.id as response_id,
      responses.submission_id,
      responses.submitted_at,
      submissions.user_id as owner_user_id,
      submissions.product_name,
      coalesce(submissions.product_types, array[submissions.product_type]) as product_types,
      submissions.description,
      submissions.needs_google_play_closed_testers,
      case
        when public.profile_is_clear(submissions.user_id) then submissions.status
        else 'paused'
      end as submission_status
    from public.test_responses responses
    join public.submissions submissions
      on submissions.id = responses.submission_id
    where responses.tester_user_id = auth.uid()
  ),
  owner_metrics as (
    select
      owners.owner_user_id,
      rates.owner_test_back_rate_percent,
      coalesce((
        select round(
          avg(
            case ratings.rating_value
              when 'frowny' then 0
              when 'neutral' then 50
              when 'smiley' then 100
              else 100
            end
          )
        )::integer
        from public.feedback_ratings ratings
        join public.test_responses rated_responses
          on rated_responses.id = ratings.test_response_id
        where rated_responses.tester_user_id = owners.owner_user_id
          and rated_responses.status = 'approved'
          and rated_responses.credit_awarded = true
      ), 100) as owner_satisfaction_rate_percent
    from (
      select distinct authored_responses.owner_user_id
      from authored_responses
    ) owners
    join lateral public.get_effective_test_back_rate_for_owner(owners.owner_user_id) rates
      on true
  )
  select
    authored_responses.response_id,
    authored_responses.submission_id,
    authored_responses.product_name,
    authored_responses.product_types,
    authored_responses.description,
    authored_responses.needs_google_play_closed_testers,
    authored_responses.submitted_at,
    ratings.rating_value,
    owner_metrics.owner_test_back_rate_percent,
    owner_metrics.owner_satisfaction_rate_percent,
    authored_responses.submission_status,
    reports.status as report_status
  from authored_responses
  left join public.feedback_ratings ratings
    on ratings.test_response_id = authored_responses.response_id
   and ratings.rated_by_user_id = authored_responses.owner_user_id
  left join public.feedback_rating_reports reports
    on reports.test_response_id = authored_responses.response_id
   and reports.reporter_user_id = auth.uid()
  join owner_metrics
    on owner_metrics.owner_user_id = authored_responses.owner_user_id
  order by authored_responses.submitted_at desc;
end;
$$;

grant execute on function public.get_my_submitted_feedback_cards() to authenticated;
