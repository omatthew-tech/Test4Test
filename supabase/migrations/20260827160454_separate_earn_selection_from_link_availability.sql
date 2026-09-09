drop trigger if exists pause_other_live_submissions_for_owner_on_submissions
  on public.submissions;

drop function if exists public.pause_other_live_submissions_for_owner();

drop index if exists public.submissions_one_live_per_user_idx;

update public.submissions submissions
set is_open_for_more_tests = false
where submissions.status <> 'live'
  and submissions.is_open_for_more_tests = true;

-- Before Earn selection was independent from public-link availability, replacing an
-- Earn test paused the previous row. Restore only those rotation-paused rows that
-- were not paused after a confirmed moderation report.
update public.submissions submissions
set status = 'live',
    is_open_for_more_tests = false
where submissions.status = 'paused'
  and not exists (
    select 1
    from public.submission_reports reports
    where reports.submission_id = submissions.id
      and reports.status = 'confirmed'
  );

alter table public.submissions
  drop constraint if exists submissions_earn_open_requires_live;

alter table public.submissions
  add constraint submissions_earn_open_requires_live
  check (is_open_for_more_tests = false or status = 'live');

create unique index submissions_one_earn_test_per_user_idx
  on public.submissions (user_id)
  where status = 'live'
    and is_open_for_more_tests = true
    and user_id is not null;

create or replace function private.enforce_single_earn_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'live' then
    new.is_open_for_more_tests := false;
    return new;
  end if;

  if new.is_open_for_more_tests = true and new.user_id is not null then
    update public.submissions submissions
    set is_open_for_more_tests = false
    where submissions.user_id = new.user_id
      and submissions.status = 'live'
      and submissions.is_open_for_more_tests = true
      and submissions.id is distinct from new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_single_earn_submission()
  from public, anon, authenticated;

create trigger enforce_single_earn_submission_on_submissions
  before insert or update of user_id, status, is_open_for_more_tests
  on public.submissions
  for each row
  execute procedure private.enforce_single_earn_submission();

create or replace function public.activate_earn_submission(
  p_submission_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before choosing an Earn test.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select profiles.account_type
  into v_account_type
  from public.profiles profiles
  where profiles.id = v_user_id;

  if v_account_type is distinct from 'founder' then
    raise exception 'Only founder accounts can choose an Earn test.';
  end if;

  -- Lock the owner's rows in a stable order so concurrent swaps cannot leave two
  -- tests selected or overwrite one another unpredictably.
  perform submissions.id
  from public.submissions submissions
  where submissions.user_id = v_user_id
  order by submissions.id
  for update;

  select submissions.id
  into v_submission_id
  from public.submissions submissions
  where submissions.id = p_submission_id
    and submissions.user_id = v_user_id
    and submissions.status = 'live';

  if v_submission_id is null then
    raise exception 'That test is unavailable for Earn while it is paused or under review.';
  end if;

  update public.submissions submissions
  set is_open_for_more_tests = true
  where submissions.id = v_submission_id
  returning submissions.id into v_submission_id;

  return v_submission_id;
end;
$$;

revoke all on function public.activate_earn_submission(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_earn_submission(uuid)
  to authenticated;

create or replace function public.user_is_google_play_closed_test_pool(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions submissions
    where submissions.user_id = p_user_id
      and submissions.status = 'live'
      and submissions.is_open_for_more_tests = true
      and submissions.needs_google_play_closed_testers = true
      and public.profile_is_clear(submissions.user_id)
  );
$$;

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
set search_path = ''
as $$
  with owner_pool as (
    select exists (
      select 1
      from public.submissions owner_submissions
      where owner_submissions.user_id = p_owner_user_id
        and owner_submissions.status = 'live'
        and owner_submissions.is_open_for_more_tests = true
        and owner_submissions.needs_google_play_closed_testers = true
    ) as needs_google_play_closed_testers
  ),
  tester_pool as (
    select exists (
      select 1
      from public.submissions tester_submissions
      where tester_submissions.user_id = p_tester_user_id
        and tester_submissions.status = 'live'
        and tester_submissions.is_open_for_more_tests = true
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

create or replace function public.get_my_earn_visibility_summary()
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
  satisfaction_rate_percent integer
)
language plpgsql
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
      public.user_has_completed_credited_test(v_user_id) as has_completed_test,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = v_user_id
      ), 0)::integer as token_balance,
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
      and public.user_has_completed_credited_test(submissions.user_id)
  ),
  private_rankable_submissions as (
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
      and (
        public.user_has_completed_credited_test(submissions.user_id)
        or submissions.id = live_submission.id
      )
  ),
  private_rankable_owners as (
    select distinct private_rankable_submissions.user_id
    from private_rankable_submissions
  ),
  owner_metrics as (
    select
      private_rankable_owners.user_id,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = private_rankable_owners.user_id
      ), 0)::integer as token_balance,
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
        where rated_responses.tester_user_id = private_rankable_owners.user_id
          and rated_responses.status = 'approved'
          and rated_responses.credit_awarded = true
      ), 100) as satisfaction_rate_percent
    from private_rankable_owners
    join lateral public.get_effective_test_back_rate_for_owner(private_rankable_owners.user_id) rates
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
      (count(*) over ())::integer as ranked_submission_count
    from eligible_submissions
    join owner_metrics
      on owner_metrics.user_id = eligible_submissions.user_id
  ),
  private_ranked_submissions as (
    select
      private_rankable_submissions.id,
      (row_number() over (
        order by
          owner_metrics.token_balance desc,
          private_rankable_submissions.promoted desc,
          (
            owner_metrics.owner_test_back_rate_percent +
            owner_metrics.satisfaction_rate_percent
          ) desc,
          private_rankable_submissions.response_count asc,
          private_rankable_submissions.created_at desc,
          private_rankable_submissions.id desc
      ))::integer as rank,
      (count(*) over ())::integer as ranked_submission_count
    from private_rankable_submissions
    join owner_metrics
      on owner_metrics.user_id = private_rankable_submissions.user_id
  )
  select
    live_submission.id as submission_id,
    live_submission.product_name,
    current_metrics.has_completed_test,
    ranked_submissions.rank,
    coalesce(ranked_submissions.ranked_submission_count, 0) as ranked_submission_count,
    private_ranked_submissions.rank as would_rank,
    coalesce(private_ranked_submissions.ranked_submission_count, 0) as would_ranked_submission_count,
    current_metrics.token_balance,
    case
      when current_metrics.has_completed_test then current_metrics.owner_test_back_rate_percent
      else null
    end as test_back_rate_percent,
    case
      when current_metrics.has_completed_test then current_metrics.satisfaction_rate_percent
      else null
    end as satisfaction_rate_percent
  from current_metrics
  left join live_submission on true
  left join ranked_submissions
    on ranked_submissions.id = live_submission.id
  left join private_ranked_submissions
    on private_ranked_submissions.id = live_submission.id;
end;
$$;
