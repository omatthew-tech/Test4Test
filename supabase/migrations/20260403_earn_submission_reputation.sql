drop function if exists public.get_earn_submission_reputation(uuid[]);

create or replace function public.get_earn_submission_reputation(
  p_submission_ids uuid[]
)
returns table (
  submission_id uuid,
  owner_has_tested_you boolean,
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

  return query
  with visible_submissions as (
    select
      submissions.id as submission_id,
      submissions.user_id as owner_user_id
    from public.submissions submissions
    where submissions.id = any (coalesce(p_submission_ids, array[]::uuid[]))
      and submissions.status = 'live'
      and submissions.user_id <> auth.uid()
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
          and viewer_submissions.user_id = auth.uid()
      ) as owner_has_tested_you,
      coalesce((
        with inbound_testers as (
          select distinct responses.tester_user_id
          from public.test_responses responses
          join public.submissions owner_submissions
            on owner_submissions.id = responses.submission_id
          where owner_submissions.user_id = owners.owner_user_id
        )
        select round(
          100.0 * count(*) filter (
            where exists (
              select 1
              from public.test_responses reciprocated_responses
              join public.submissions reciprocated_submissions
                on reciprocated_submissions.id = reciprocated_responses.submission_id
              where reciprocated_responses.tester_user_id = owners.owner_user_id
                and reciprocated_submissions.user_id = inbound_testers.tester_user_id
            )
          ) / nullif(count(*), 0)
        )::integer
        from inbound_testers
      ), 100) as owner_test_back_rate_percent,
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
      ), 100) as owner_satisfaction_rate_percent
    from (
      select distinct visible_submissions.owner_user_id
      from visible_submissions
    ) owners
  )
  select
    visible_submissions.submission_id,
    owner_metrics.owner_has_tested_you,
    owner_metrics.owner_test_back_rate_percent,
    owner_metrics.owner_satisfaction_rate_percent
  from visible_submissions
  join owner_metrics
    on owner_metrics.owner_user_id = visible_submissions.owner_user_id
  order by visible_submissions.submission_id;
end;
$$;

grant execute on function public.get_earn_submission_reputation(uuid[]) to authenticated;
