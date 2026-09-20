-- Enrollment is deliberately disabled until backend, email links, and UI are verified.
create table private.earn_experiments (
  key text primary key,
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  final_report jsonb,
  check ((status = 'draft') = (started_at is null)),
  check ((status = 'ended') = (ended_at is not null))
);
insert into private.earn_experiments(key) values ('earn_activation_v1');

create table private.earn_experiment_visits (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('feedback_email', 'test_back_email', 'other_email',
    'normal_sign_in', 'signup_onboarding', 'shared_link', 'external_referral', 'direct_or_unknown')),
  entry_route text not null check (entry_route in ('home', 'earn', 'analytics', 'recordings',
    'test', 'shared_link', 'sign_in', 'signup', 'other')),
  created_at timestamptz not null default clock_timestamp()
);
create index earn_experiment_visits_user_idx on private.earn_experiment_visits(user_id);

create table private.earn_experiment_assignments (
  experiment_key text not null references private.earn_experiments(key),
  user_id uuid not null references public.profiles(id) on delete cascade,
  variant text not null check (variant in ('A', 'B')),
  assigned_at timestamptz not null default clock_timestamp(),
  first_exposed_at timestamptz,
  exposure_visit_id uuid references private.earn_experiment_visits(id) on delete set null,
  first_completed_at timestamptz,
  first_response_id uuid references public.test_responses(id) on delete set null,
  completion_visit_id uuid references private.earn_experiment_visits(id) on delete set null,
  primary key (experiment_key, user_id)
);
create index earn_experiment_assignments_user_idx on private.earn_experiment_assignments(user_id);

-- Keep the submission visit even if moderation approves the response later.
create table private.earn_experiment_response_visits (
  response_id uuid primary key references public.test_responses(id) on delete cascade,
  visit_id uuid not null references private.earn_experiment_visits(id) on delete cascade
);
create index earn_experiment_response_visits_visit_idx on private.earn_experiment_response_visits(visit_id);

alter table private.earn_experiments enable row level security;
alter table private.earn_experiment_visits enable row level security;
alter table private.earn_experiment_assignments enable row level security;
alter table private.earn_experiment_response_visits enable row level security;
revoke all on private.earn_experiments, private.earn_experiment_visits,
  private.earn_experiment_assignments, private.earn_experiment_response_visits from public, anon, authenticated;

create function private.enroll_earn_experiment(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_experiment private.earn_experiments%rowtype;
begin
  select * into v_experiment from private.earn_experiments
    where key = 'earn_activation_v1' and status = 'running' for share;
  if not found or p_user_id is null then return; end if;
  -- Serializes enrollment with the response trigger for this owner, including concurrent tabs.
  perform pg_advisory_xact_lock(hashtextextended('earn_activation:' || p_user_id::text, 0));
  if exists (select 1 from private.earn_experiment_assignments
      where experiment_key = v_experiment.key and user_id = p_user_id) then return; end if;
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_user_id and p.account_type = 'founder'
      and u.created_at >= v_experiment.started_at
      and public.profile_is_clear(p.id)
      and not exists (select 1 from public.admin_users a where a.email = lower(u.email))
  ) or not exists (
    select 1 from public.submissions s where s.user_id = p_user_id
      and s.status = 'live' and s.is_open_for_more_tests
  ) or public.user_has_completed_credited_test(p_user_id)
    or exists (select 1 from public.credit_transactions c
      where c.user_id = p_user_id and c.type = 'earned_test' and c.amount > 0)
  then return; end if;
  -- Auth UUIDs supply unbiased input; a versioned hash makes retries choose the same arm.
  insert into private.earn_experiment_assignments(experiment_key, user_id, variant)
    values (v_experiment.key, p_user_id,
      case when get_byte(decode(md5(v_experiment.key || ':' || p_user_id::text), 'hex'), 0) < 128
        then 'A' else 'B' end)
    on conflict (experiment_key, user_id) do nothing;
end;
$$;

create function private.enroll_earn_submission_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'live' and new.is_open_for_more_tests then
    perform private.enroll_earn_experiment(new.user_id);
  end if;
  return new;
end;
$$;
create trigger enroll_earn_experiment_on_submission
  after insert or update of status, is_open_for_more_tests, user_id on public.submissions
  for each row execute function private.enroll_earn_submission_trigger();

-- Founder signup can finish after the draft has already been published.
create function private.enroll_earn_profile_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_type = 'founder' then perform private.enroll_earn_experiment(new.id); end if;
  return new;
end;
$$;
create trigger enroll_earn_experiment_on_profile
  after update of account_type on public.profiles
  for each row execute function private.enroll_earn_profile_trigger();

create function private.earn_listing_locked(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.earn_experiment_assignments a
    join private.earn_experiments e on e.key = a.experiment_key
    where a.user_id = p_user_id and a.variant = 'B'
      and e.status in ('running', 'paused') and a.first_completed_at is null
      and not public.user_has_completed_credited_test(p_user_id)
  );
$$;

create function private.record_earn_first_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tester_user_id is null or new.status <> 'approved' or not new.credit_awarded then
    return new;
  end if;
  -- Share-lock pairs with End's update-lock, so no completion can slip past the cutoff.
  perform 1 from private.earn_experiments
    where key = 'earn_activation_v1' and status in ('running', 'paused') for share;
  if not found then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('earn_activation:' || new.tester_user_id::text, 0));
  update private.earn_experiment_assignments
    set first_completed_at = clock_timestamp(), first_response_id = new.id,
      completion_visit_id = (select visit_id from private.earn_experiment_response_visits where response_id = new.id)
    where experiment_key = 'earn_activation_v1' and user_id = new.tester_user_id
      and first_completed_at is null;
  return new;
end;
$$;
create trigger record_earn_first_completion_on_response
  after insert or update of status, credit_awarded on public.test_responses
  for each row execute function private.record_earn_first_completion();

create function private.record_earn_visit(p_visit_id uuid, p_source text, p_entry_route text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.current_user_has_app_access() then
    raise exception 'Sign in to record your visit.';
  end if;
  if not exists (select 1 from private.earn_experiments e join auth.users u on u.id = v_user_id
    join public.profiles p on p.id = u.id
    where e.key = 'earn_activation_v1' and e.status in ('running', 'paused')
      and u.created_at >= e.started_at and p.account_type = 'founder') then return null; end if;
  insert into private.earn_experiment_visits(id, user_id, source, entry_route)
    values (p_visit_id, v_user_id, p_source, p_entry_route)
    on conflict (id) do nothing;
  if not exists (select 1 from private.earn_experiment_visits
    where id = p_visit_id and user_id = v_user_id) then
    raise exception 'This visit belongs to another account.';
  end if;
  return p_visit_id;
end;
$$;
create function public.record_earn_visit(p_visit_id uuid, p_source text, p_entry_route text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.record_earn_visit(p_visit_id, p_source, p_entry_route);
$$;

create function private.record_earn_exposure(p_experiment_key text, p_variant text, p_visit_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_visit_id uuid;
begin
  if v_user_id is null or not public.current_user_has_app_access() then
    raise exception 'Sign in to record your Earn view.';
  end if;
  perform 1 from private.earn_experiments where key = p_experiment_key
    and status in ('running', 'paused') for share;
  if not found then return false; end if;
  select id into v_visit_id from private.earn_experiment_visits
    where id = p_visit_id and user_id = v_user_id;
  update private.earn_experiment_assignments
    set first_exposed_at = clock_timestamp(), exposure_visit_id = v_visit_id
    where experiment_key = p_experiment_key and user_id = v_user_id and variant = p_variant
      and first_exposed_at is null and first_completed_at is null;
  return exists (select 1 from private.earn_experiment_assignments
    where experiment_key = p_experiment_key and user_id = v_user_id and variant = p_variant
      and first_exposed_at is not null);
end;
$$;
create function public.record_earn_exposure(p_experiment_key text, p_variant text, p_visit_id uuid default null)
returns boolean language sql security invoker set search_path = '' as $$
  select private.record_earn_exposure(p_experiment_key, p_variant, p_visit_id);
$$;

create function private.submit_test_response_with_attribution(
  p_submission_id uuid, p_answers jsonb, p_duration_seconds integer,
  p_recording_bucket text, p_recording_path text, p_question_set_version_id uuid,
  p_submission_version_id uuid, p_visit_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_visit_id uuid;
begin
  if auth.uid() is null or not public.current_user_has_app_access() then
    raise exception 'Sign in before completing tests.';
  end if;
  select id into v_visit_id from private.earn_experiment_visits
    where id = p_visit_id and user_id = auth.uid();
  v_result := public.submit_test_response(p_submission_id, p_answers, p_duration_seconds,
    p_recording_bucket, p_recording_path, p_question_set_version_id, p_submission_version_id);
  if v_visit_id is not null then
    insert into private.earn_experiment_response_visits(response_id, visit_id)
      select r.id, v_visit_id from public.test_responses r
      where r.id = (v_result ->> 'responseId')::uuid and r.tester_user_id = auth.uid()
        and exists (select 1 from private.earn_experiment_assignments a
          join private.earn_experiments e on e.key = a.experiment_key
          where a.user_id = auth.uid() and e.status in ('running', 'paused'))
      on conflict (response_id) do nothing;
  end if;
  if (v_result ->> 'creditAwarded')::boolean = true then
    update private.earn_experiment_assignments a set completion_visit_id = v_visit_id
      from private.earn_experiments e
      where a.experiment_key = e.key and e.status in ('running', 'paused')
        and a.user_id = auth.uid() and a.first_response_id = (v_result ->> 'responseId')::uuid
        and a.completion_visit_id is null;
  end if;
  return v_result;
end;
$$;
create function public.submit_test_response_with_attribution(
  p_submission_id uuid, p_answers jsonb, p_duration_seconds integer,
  p_recording_bucket text default null, p_recording_path text default null,
  p_question_set_version_id uuid default null, p_submission_version_id uuid default null,
  p_visit_id uuid default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_test_response_with_attribution(p_submission_id, p_answers, p_duration_seconds,
    p_recording_bucket, p_recording_path, p_question_set_version_id, p_submission_version_id, p_visit_id);
$$;

create function private.earn_experiment_report()
returns jsonb language sql stable security definer set search_path = '' as $$
  with variants(variant) as (values ('A'), ('B')),
  participants as (
    select a.*, coalesce(ev.source, 'direct_or_unknown') as exposure_source,
      coalesce(cv.source, 'direct_or_unknown') as completion_source
    from private.earn_experiment_assignments a
    left join private.earn_experiment_visits ev on ev.id = a.exposure_visit_id
    left join private.earn_experiment_visits cv on cv.id = a.completion_visit_id
    where a.experiment_key = 'earn_activation_v1'
  ),
  totals as (
    select v.variant, count(p.user_id) as assigned,
      count(p.user_id) filter (where p.first_exposed_at is not null) as exposed,
      count(p.user_id) filter (where p.first_exposed_at is null) as unexposed,
      count(p.user_id) filter (where p.first_exposed_at <= p.first_completed_at) as completed,
      percentile_cont(0.5) within group (
        order by extract(epoch from (p.first_completed_at - p.first_exposed_at))
      ) filter (where p.first_exposed_at <= p.first_completed_at) as median_seconds
    from variants v left join participants p on p.variant = v.variant group by v.variant
  ),
  sources as (
    select variant, 'exposure' as stage, exposure_source as source, count(*) as users
    from participants where first_exposed_at is not null group by variant, exposure_source
    union all
    select variant, 'completion', completion_source, count(*)
    from participants where first_exposed_at <= first_completed_at group by variant, completion_source
  )
  select jsonb_build_object(
    'key', e.key, 'status', e.status, 'startedAt', e.started_at, 'endedAt', e.ended_at,
    'asOf', coalesce(e.ended_at, statement_timestamp()),
    'variants', (select jsonb_agg(jsonb_build_object(
      'variant', variant, 'assigned', assigned, 'exposed', exposed, 'unexposed', unexposed,
      'completed', completed, 'notCompleted', exposed - completed,
      'completionPercent', case when exposed > 0 then round(100.0 * completed / exposed, 2) else null end,
      'medianSeconds', median_seconds
    ) order by variant) from totals),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by stage, source, variant) from sources s), '[]'::jsonb)
  ) from private.earn_experiments e where e.key = 'earn_activation_v1';
$$;

create function private.manage_earn_experiment(p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_experiment private.earn_experiments%rowtype; v_report jsonb;
begin
  if auth.uid() is null or not public.current_user_has_app_access() or not exists (
    select 1 from auth.users u join public.admin_users a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  ) then raise exception 'You do not have admin access.' using errcode = '42501'; end if;
  if p_action not in ('report', 'start', 'pause', 'end') or p_action is null then
    raise exception 'Unknown experiment action.';
  end if;
  select * into strict v_experiment from private.earn_experiments
    where key = 'earn_activation_v1' for update;
  if p_action <> 'report' and v_experiment.status = 'ended' then
    raise exception 'This experiment has ended. Create a new experiment to run another comparison.';
  end if;
  if p_action = 'start' then
    update private.earn_experiments set status = 'running',
      started_at = coalesce(started_at, clock_timestamp()), updated_by = auth.uid()
      where key = v_experiment.key;
  elsif p_action = 'pause' then
    if v_experiment.status <> 'running' then raise exception 'Only a running experiment can be paused.'; end if;
    update private.earn_experiments set status = 'paused', updated_by = auth.uid()
      where key = v_experiment.key;
  elsif p_action = 'end' then
    if v_experiment.status = 'draft' then raise exception 'This experiment has not started.'; end if;
    update private.earn_experiments set status = 'ended', ended_at = clock_timestamp(), updated_by = auth.uid()
      where key = v_experiment.key;
    v_report := private.earn_experiment_report();
    update private.earn_experiments set final_report = v_report where key = v_experiment.key;
    return v_report;
  end if;
  select final_report into v_report from private.earn_experiments where key = v_experiment.key;
  return coalesce(v_report, private.earn_experiment_report());
end;
$$;
create function public.manage_earn_experiment(p_action text default 'report')
returns jsonb language sql security invoker set search_path = '' as $$
  select private.manage_earn_experiment(p_action);
$$;

-- Only checked entrypoints are callable. Internal triggers, eligibility, and aggregates are private.
revoke all on function private.enroll_earn_experiment(uuid), private.enroll_earn_submission_trigger(),
  private.enroll_earn_profile_trigger(), private.earn_listing_locked(uuid),
  private.record_earn_first_completion(), private.earn_experiment_report() from public, anon, authenticated;
revoke all on function private.record_earn_visit(uuid,text,text), public.record_earn_visit(uuid,text,text),
  private.record_earn_exposure(text,text,uuid), public.record_earn_exposure(text,text,uuid),
  private.submit_test_response_with_attribution(uuid,jsonb,integer,text,text,uuid,uuid,uuid),
  public.submit_test_response_with_attribution(uuid,jsonb,integer,text,text,uuid,uuid,uuid),
  private.manage_earn_experiment(text), public.manage_earn_experiment(text) from public, anon, authenticated;
grant execute on function private.record_earn_visit(uuid,text,text), public.record_earn_visit(uuid,text,text),
  private.record_earn_exposure(text,text,uuid), public.record_earn_exposure(text,text,uuid),
  private.submit_test_response_with_attribution(uuid,jsonb,integer,text,text,uuid,uuid,uuid),
  public.submit_test_response_with_attribution(uuid,jsonb,integer,text,text,uuid,uuid,uuid),
  private.manage_earn_experiment(text), public.manage_earn_experiment(text) to authenticated;


-- Preserve the complete listing contract, adding only the experiment eligibility predicate.
create or replace function public.list_earn_submissions(p_product_types text[])
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
  created_at timestamptz,
  reward_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_types text[];
  v_account_type text;
  v_paid_access boolean := false;
  v_needs_google_play_closed_testers boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in to browse Earn tests.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select profiles.account_type into v_account_type
  from public.profiles profiles
  where profiles.id = v_user_id;

  if v_account_type = 'tester' then
    select paid_access_unlocked into v_paid_access
    from private.tester_paid_access_counts(v_user_id);
  end if;

  select coalesce(
    array_agg(normalized.product_type order by array_position(array['website', 'ios', 'android']::text[], normalized.product_type)),
    array[]::text[]
  )
  into v_product_types
  from (
    select distinct unnest(coalesce(p_product_types, array[]::text[])) as product_type
  ) normalized
  where normalized.product_type = any (array['website', 'ios', 'android']::text[]);

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
    submissions.created_at,
    submissions.reward_type
  from public.submissions submissions
  where submissions.status = 'live'
    and submissions.user_id <> v_user_id
    and submissions.is_open_for_more_tests = true
    and submissions.needs_google_play_closed_testers = v_needs_google_play_closed_testers
    and public.profile_is_clear(submissions.user_id)
    and not private.earn_listing_locked(submissions.user_id)
    and coalesce(submissions.product_types, array[submissions.product_type]) && v_product_types
    and submissions.reward_type = case
      when v_account_type = 'tester' and v_paid_access then 'paid'
      else 'credit'
    end
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

-- Replace both signatures together; legacy columns retain their names and types.
drop function public.get_my_earn_visibility_summary();
drop function if exists private.get_my_earn_visibility_summary_with_preview();
create or replace function private.get_my_earn_visibility_summary_with_preview()
returns table (
  submission_id uuid,
  product_name text,
  has_completed_test boolean,
  rank integer,
  ranked_submission_count integer,
  would_rank integer,
  would_ranked_submission_count integer,
  token_balance integer,
  test_back_rate_percent integer,
  satisfaction_rate_percent integer,
  rank_after_one_credit integer,
  experiment_key text,
  experiment_variant text,
  listing_locked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in to view your Earn visibility summary.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  return query
  with current_metrics as (
    select
      (public.user_has_completed_credited_test(v_user_id) or exists (
        select 1 from private.earn_experiment_assignments a
        where a.user_id = v_user_id and a.first_completed_at is not null
      )) as has_completed_test,
      private.earn_listing_locked(v_user_id) as listing_locked,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = v_user_id
      ), 0)::integer as token_balance,
      rates.owner_test_back_rate_percent,
      coalesce((
        select round(
          avg(
            ratings.star_rating * 20.0
          )
        )::integer
        from public.feedback_ratings ratings
        join public.test_responses rated_responses
          on rated_responses.id = ratings.test_response_id
        where rated_responses.tester_user_id = v_user_id
          and rated_responses.status = 'approved'
          and rated_responses.credit_awarded = true
      ), 100) as satisfaction_rate_percent
    from public.get_effective_test_back_rate_for_owner(v_user_id) rates
  ),
  live_submission as (
    select
      submissions.id,
      submissions.product_name,
      submissions.needs_google_play_closed_testers
    from public.submissions submissions
    where submissions.user_id = v_user_id
      and submissions.status = 'live'
      and submissions.is_open_for_more_tests = true
    order by submissions.created_at desc, submissions.id desc
    limit 1
  ),
  eligible_submissions as (
    select
      submissions.id,
      submissions.user_id,
      coalesce(submissions.promoted, false) as promoted,
      submissions.response_count,
      submissions.created_at
    from public.submissions submissions
    join live_submission
      on submissions.needs_google_play_closed_testers = live_submission.needs_google_play_closed_testers
    where submissions.status = 'live'
      and submissions.is_open_for_more_tests = true
      and submissions.user_id is not null
      and public.profile_is_clear(submissions.user_id)
      and (not private.earn_listing_locked(submissions.user_id) or submissions.user_id = v_user_id)
  ),
  eligible_owners as (
    select distinct eligible_submissions.user_id
    from eligible_submissions
  ),
  owner_metrics as (
    select
      eligible_owners.user_id,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = eligible_owners.user_id
      ), 0)::integer as token_balance,
      rates.owner_test_back_rate_percent,
      coalesce((
        select round(
          avg(
            ratings.star_rating * 20.0
          )
        )::integer
        from public.feedback_ratings ratings
        join public.test_responses rated_responses
          on rated_responses.id = ratings.test_response_id
        where rated_responses.tester_user_id = eligible_owners.user_id
          and rated_responses.status = 'approved'
          and rated_responses.credit_awarded = true
      ), 100) as satisfaction_rate_percent
    from eligible_owners
    join lateral public.get_effective_test_back_rate_for_owner(eligible_owners.user_id) rates
      on true
  ),
  ranked_submissions as (
    select
      eligible_submissions.id,
      (row_number() over (
        order by
          owner_metrics.token_balance desc,
          eligible_submissions.promoted desc,
          (
            owner_metrics.owner_test_back_rate_percent +
            owner_metrics.satisfaction_rate_percent
          ) desc,
          eligible_submissions.response_count asc,
          eligible_submissions.created_at desc,
          eligible_submissions.id desc
      ))::integer as rank,
      (row_number() over (
        order by
          (owner_metrics.token_balance + case when eligible_submissions.user_id = v_user_id then 1 else 0 end) desc,
          eligible_submissions.promoted desc,
          (
            owner_metrics.owner_test_back_rate_percent +
            owner_metrics.satisfaction_rate_percent
          ) desc,
          eligible_submissions.response_count asc,
          eligible_submissions.created_at desc,
          eligible_submissions.id desc
      ))::integer as rank_after_one_credit,
      (count(*) over ())::integer as ranked_submission_count
    from eligible_submissions
    join owner_metrics
      on owner_metrics.user_id = eligible_submissions.user_id
  )
  select
    live_submission.id as submission_id,
    live_submission.product_name,
    current_metrics.has_completed_test,
    case when current_metrics.listing_locked then null else ranked_submissions.rank end,
    greatest(0, coalesce(ranked_submissions.ranked_submission_count, 0) -
      case when current_metrics.listing_locked and ranked_submissions.rank is not null then 1 else 0 end) as ranked_submission_count,
    ranked_submissions.rank as would_rank,
    coalesce(ranked_submissions.ranked_submission_count, 0) as would_ranked_submission_count,
    current_metrics.token_balance,
    case
      when current_metrics.has_completed_test then current_metrics.owner_test_back_rate_percent
      else null
    end as test_back_rate_percent,
    case
      when current_metrics.has_completed_test then current_metrics.satisfaction_rate_percent
      else null
    end as satisfaction_rate_percent,
    case when not current_metrics.has_completed_test and not current_metrics.listing_locked
      then ranked_submissions.rank_after_one_credit end,
    assignment.experiment_key,
    assignment.variant,
    current_metrics.listing_locked
  from current_metrics
  left join live_submission on true
  left join private.earn_experiment_assignments assignment on assignment.user_id = v_user_id
    and assignment.experiment_key = 'earn_activation_v1'
    and exists (select 1 from private.earn_experiments e where e.key = assignment.experiment_key
      and e.status in ('running', 'paused'))
  left join ranked_submissions
    on ranked_submissions.id = live_submission.id;
end;
$$;
revoke all on function private.get_my_earn_visibility_summary_with_preview() from public, anon;
grant execute on function private.get_my_earn_visibility_summary_with_preview() to authenticated;
create function public.get_my_earn_visibility_summary()
returns table (
  submission_id uuid,
  product_name text,
  has_completed_test boolean,
  rank integer,
  ranked_submission_count integer,
  would_rank integer,
  would_ranked_submission_count integer,
  token_balance integer,
  test_back_rate_percent integer,
  satisfaction_rate_percent integer,
  rank_after_one_credit integer,
  experiment_key text,
  experiment_variant text,
  listing_locked boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_my_earn_visibility_summary_with_preview();
$$;

revoke all on function public.get_my_earn_visibility_summary() from public, anon;
grant execute on function public.get_my_earn_visibility_summary() to authenticated;
