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
  owner_metrics as (
    select
      owners.user_id,
      public.user_has_completed_credited_test(owners.user_id) as has_completed_test,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = owners.user_id
      ), 0)::integer as credit_balance,
      rates.owner_test_back_rate_percent as test_back_rate_percent,
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
        where rated_responses.tester_user_id = owners.user_id
          and rated_responses.status = 'approved'
          and rated_responses.credit_awarded = true
      ), 100) as satisfaction_rate_percent
    from (
      select distinct eligible_submissions.user_id
      from eligible_submissions
    ) owners
    join lateral public.get_effective_test_back_rate_for_owner(owners.user_id) rates
      on true
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
