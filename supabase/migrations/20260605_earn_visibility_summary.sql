with ranked_live_submissions as (
  select
    submissions.id,
    row_number() over (
      partition by submissions.user_id
      order by submissions.created_at desc, submissions.id desc
    ) as live_rank
  from public.submissions submissions
  where submissions.status = 'live'
    and submissions.user_id is not null
)
update public.submissions submissions
set status = 'paused'
from ranked_live_submissions ranked
where submissions.id = ranked.id
  and ranked.live_rank > 1;

create or replace function public.pause_other_live_submissions_for_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'live' and new.user_id is not null then
    update public.submissions submissions
    set status = 'paused'
    where submissions.user_id = new.user_id
      and submissions.status = 'live'
      and submissions.id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists pause_other_live_submissions_for_owner_on_submissions on public.submissions;
create trigger pause_other_live_submissions_for_owner_on_submissions
  before insert or update of user_id, status on public.submissions
  for each row
  when (new.status = 'live')
  execute procedure public.pause_other_live_submissions_for_owner();

create unique index if not exists submissions_one_live_per_user_idx
  on public.submissions (user_id)
  where status = 'live'
    and user_id is not null;

drop function if exists public.get_my_earn_visibility_summary();
create or replace function public.get_my_earn_visibility_summary()
returns table (
  submission_id uuid,
  product_name text,
  rank integer,
  ranked_submission_count integer,
  token_balance integer,
  test_back_rate_percent integer,
  satisfaction_rate_percent integer
)
language plpgsql
security definer
set search_path = public
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
      (count(*) over ())::integer as ranked_submission_count
    from eligible_submissions
    join owner_metrics
      on owner_metrics.user_id = eligible_submissions.user_id
  )
  select
    live_submission.id as submission_id,
    live_submission.product_name,
    ranked_submissions.rank,
    coalesce(ranked_submissions.ranked_submission_count, 0) as ranked_submission_count,
    current_metrics.token_balance,
    current_metrics.owner_test_back_rate_percent,
    current_metrics.satisfaction_rate_percent
  from current_metrics
  left join live_submission on true
  left join ranked_submissions
    on ranked_submissions.id = live_submission.id;
end;
$$;

grant execute on function public.get_my_earn_visibility_summary() to authenticated;
