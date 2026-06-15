drop function if exists public.get_earn_submission_reputation(uuid[]);

create or replace function public.get_earn_submission_reputation(
  p_submission_ids uuid[]
)
returns table (
  submission_id uuid,
  owner_has_tested_you boolean,
  owner_has_completed_test boolean,
  owner_credit_balance integer,
  owner_test_back_rate_percent integer,
  owner_satisfaction_rate_percent integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to load earn card reputation.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  return query
  with visible_submissions as (
    select
      submissions.id as submission_id,
      submissions.user_id as owner_user_id
    from public.submissions submissions
    where submissions.id = any (coalesce(p_submission_ids, array[]::uuid[]))
      and submissions.status = 'live'
      and submissions.user_id <> auth.uid()
      and public.profile_is_clear(submissions.user_id)
  ),
  owner_metrics as (
    select
      owners.owner_user_id,
      exists (
        select 1
        from public.test_responses owner_responses
        join public.submissions viewer_submissions
          on viewer_submissions.id = owner_responses.submission_id
        where owner_responses.tester_user_id = owners.owner_user_id
          and owner_responses.status = 'approved'
          and owner_responses.credit_awarded = true
          and viewer_submissions.user_id = auth.uid()
      ) as owner_has_tested_you,
      public.user_has_completed_credited_test(owners.owner_user_id) as owner_has_completed_test,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = owners.owner_user_id
      ), 0)::integer as owner_credit_balance,
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
      select distinct visible_submissions.owner_user_id
      from visible_submissions
    ) owners
    join lateral public.get_effective_test_back_rate_for_owner(owners.owner_user_id) rates
      on true
  )
  select
    visible_submissions.submission_id,
    owner_metrics.owner_has_tested_you,
    owner_metrics.owner_has_completed_test,
    owner_metrics.owner_credit_balance,
    owner_metrics.owner_test_back_rate_percent,
    owner_metrics.owner_satisfaction_rate_percent
  from visible_submissions
  join owner_metrics
    on owner_metrics.owner_user_id = visible_submissions.owner_user_id
  order by visible_submissions.submission_id;
end;
$$;

grant execute on function public.get_earn_submission_reputation(uuid[]) to authenticated;
