-- Aggregate credits and ratings once per eligible owner; retain ranking and reciprocity rules.
create or replace function public.list_home_trusted_submissions()
returns table (
  id uuid,
  product_name text,
  product_types text[],
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_submissions as (
    select
      submissions.id,
      submissions.user_id,
      submissions.product_name,
      coalesce(submissions.product_types, array[submissions.product_type]) as product_types,
      submissions.description,
      coalesce(submissions.promoted, false) as promoted,
      coalesce(submissions.response_count, 0) as response_count,
      submissions.created_at
    from public.submissions submissions
    where submissions.status = 'live'
      and submissions.is_open_for_more_tests = true
      and submissions.reward_type = 'credit'
      and submissions.needs_google_play_closed_testers = false
      and submissions.user_id is not null
      and public.profile_is_clear(submissions.user_id)
  ),
  owners as materialized (
    select distinct user_id from eligible_submissions
  ),
  balances as (
    select transactions.user_id, sum(transactions.amount)::integer as credit_balance
    from public.credit_transactions transactions join owners on owners.user_id = transactions.user_id
    group by transactions.user_id
  ),
  completed as materialized (
    select responses.id, responses.tester_user_id
    from public.test_responses responses join owners on owners.user_id = responses.tester_user_id
    where responses.status = 'approved' and responses.credit_awarded = true
  ),
  satisfaction as (
    select completed.tester_user_id, round(avg(case ratings.rating_value
      when 'frowny' then 0 when 'neutral' then 50 when 'smiley' then 100 else 100 end))::integer as rate
    from completed join public.feedback_ratings ratings on ratings.test_response_id = completed.id
    group by completed.tester_user_id
  ),
  completed_owners as (
    select distinct tester_user_id from completed
  ),
  owner_metrics as (
    select owners.user_id, completed_owners.tester_user_id is not null as has_completed_test,
      coalesce(balances.credit_balance, 0) as credit_balance,
      rates.owner_test_back_rate_percent as test_back_rate_percent,
      coalesce(satisfaction.rate, 100) as satisfaction_rate_percent
    from owners
    left join balances on balances.user_id = owners.user_id
    left join satisfaction on satisfaction.tester_user_id = owners.user_id
    left join completed_owners on completed_owners.tester_user_id = owners.user_id
    join lateral public.get_effective_test_back_rate_for_owner(owners.user_id) rates on true
  )
  select
    eligible_submissions.id,
    eligible_submissions.product_name,
    eligible_submissions.product_types,
    eligible_submissions.description
  from eligible_submissions
  join owner_metrics
    on owner_metrics.user_id = eligible_submissions.user_id
  order by
    eligible_submissions.promoted desc,
    owner_metrics.credit_balance desc,
    case
      when owner_metrics.has_completed_test then owner_metrics.test_back_rate_percent
      else 0
    end desc,
    case
      when owner_metrics.has_completed_test then owner_metrics.satisfaction_rate_percent
      else 0
    end desc,
    eligible_submissions.response_count asc,
    eligible_submissions.created_at desc
  limit 6;
$$;

revoke all on function public.list_home_trusted_submissions()
  from public, anon, authenticated;
grant execute on function public.list_home_trusted_submissions()
  to anon, authenticated;
