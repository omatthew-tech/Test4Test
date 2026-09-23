-- Repair the reviews read contract on databases that missed exact_star_ratings.
-- Deliberately leave newer Earn/ranking functions in place; do not replay the old migration.
-- Preserve legacy audit values and exact stars, and suppress historical paid-test notifications.
begin;
set local lock_timeout = '5s';
lock table public.feedback_ratings in access exclusive mode;
alter table public.feedback_ratings disable trigger sync_paid_test_notifications_after_rating;
update public.feedback_ratings
set star_rating = case rating_value when 'frowny' then 1 when 'neutral' then 3 when 'smiley' then 5 end
where star_rating is null;
alter table public.feedback_ratings
  alter column star_rating set not null,
  alter column rating_value drop not null;
alter table public.feedback_ratings drop constraint if exists feedback_ratings_star_rating_check;
alter table public.feedback_ratings add constraint feedback_ratings_star_rating_check check (star_rating between 1 and 5);
alter table public.feedback_ratings enable trigger sync_paid_test_notifications_after_rating;

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
  report_status text,
  star_rating smallint
)
language plpgsql
security definer
set search_path = ''
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
            ratings.star_rating * 20.0
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
    reports.status as report_status,
    ratings.star_rating
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

revoke all on function public.get_my_submitted_feedback_cards() from public, anon;
grant execute on function public.get_my_submitted_feedback_cards() to authenticated;
notify pgrst, 'reload schema';
commit;
