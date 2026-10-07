-- Availability is shared by reputation, rate previews, and reminder targets.
-- Preserve completed exchanges and reminder history; eligibility is evaluated on reads.
begin;
set local lock_timeout = '5s';

create or replace function public.find_test_back_target_submission(
  p_tester_user_id uuid,
  p_owner_user_id uuid
)
returns table (submission_id uuid, product_name text)
language sql
stable
security definer
set search_path = ''
as $function$
  with viewer as (
    select
      public.user_is_google_play_closed_test_pool(p_owner_user_id) as closed_test_pool,
      case
        when exists (
          select 1 from public.profiles
          where id = p_owner_user_id and account_type = 'tester'
        ) then case
          when (select paid_access_unlocked from private.tester_paid_access_counts(p_owner_user_id))
          then 'paid' else 'credit' end
        else 'credit'
      end as reward_type
  )
  select submissions.id, submissions.product_name
  from public.submissions submissions
  cross join viewer
  where submissions.user_id = p_tester_user_id
    and submissions.user_id <> p_owner_user_id
    and submissions.status = 'live'
    and submissions.is_open_for_more_tests = true
    and public.profile_is_clear(submissions.user_id)
    and not private.earn_listing_locked(submissions.user_id)
    and submissions.needs_google_play_closed_testers = viewer.closed_test_pool
    and submissions.reward_type = viewer.reward_type
    -- Personal platform preferences are filters, not reputation eligibility.
    and coalesce(submissions.product_types, array[submissions.product_type])
      && array['website', 'ios', 'android']::text[]
    and not exists (
      select 1 from public.test_responses responses
      where responses.submission_id = submissions.id
        and responses.tester_user_id = p_owner_user_id
    )
    and not exists (
      select 1 from public.submission_reports reports
      where reports.submission_id = submissions.id
        and reports.reporter_user_id = p_owner_user_id
        and reports.status in ('pending', 'confirmed')
    )
  order by coalesce(submissions.promoted, false) desc,
    submissions.response_count asc, submissions.created_at desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_test_back_rate_for_owner(p_owner_user_id uuid)
 RETURNS TABLE(owner_user_id uuid, included_inbound_tester_count integer, reciprocated_inbound_tester_count integer, owner_test_back_rate_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with inbound_testers as (
    select distinct responses.tester_user_id
    from public.test_responses responses
    join public.submissions owner_submissions
      on owner_submissions.id = responses.submission_id
    where owner_submissions.user_id = p_owner_user_id
      and responses.status = 'approved'
      and responses.credit_awarded = true
  ),
  reciprocated_testers as (
    select distinct tester_submissions.user_id as tester_user_id
    from public.test_responses owner_responses
    join public.submissions tester_submissions
      on tester_submissions.id = owner_responses.submission_id
    where owner_responses.tester_user_id = p_owner_user_id
      and owner_responses.status = 'approved'
      and owner_responses.credit_awarded = true
  ),
  penalized_testers as (
    select distinct sequences.tester_user_id
    from public.test_back_reminder_sequences sequences
    where sequences.owner_user_id = p_owner_user_id
      and sequences.affects_test_back_rate = true
      and exists (
        select 1 from public.find_test_back_target_submission(
          sequences.tester_user_id, p_owner_user_id
        )
      )
  )
  select
    p_owner_user_id as owner_user_id,
    count(*) filter (
      where reciprocated_testers.tester_user_id is not null
         or penalized_testers.tester_user_id is not null
    )::integer as included_inbound_tester_count,
    count(*) filter (
      where reciprocated_testers.tester_user_id is not null
    )::integer as reciprocated_inbound_tester_count,
    coalesce(
      round(
        100.0 * count(*) filter (
          where reciprocated_testers.tester_user_id is not null
        ) / nullif(
          count(*) filter (
            where reciprocated_testers.tester_user_id is not null
               or penalized_testers.tester_user_id is not null
          ),
          0
        )
      )::integer,
      100
    ) as owner_test_back_rate_percent
  from inbound_testers
  left join reciprocated_testers
    on reciprocated_testers.tester_user_id = inbound_testers.tester_user_id
  left join penalized_testers
    on penalized_testers.tester_user_id = inbound_testers.tester_user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_test_back_rate_transition(p_owner_user_id uuid, p_pending_tester_user_id uuid)
 RETURNS TABLE(current_test_back_rate_percent integer, new_test_back_rate_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with inbound_testers as (
    select distinct responses.tester_user_id
    from public.test_responses responses
    join public.submissions owner_submissions
      on owner_submissions.id = responses.submission_id
    where owner_submissions.user_id = p_owner_user_id
      and responses.status = 'approved'
      and responses.credit_awarded = true
  ),
  reciprocated_testers as (
    select distinct tester_submissions.user_id as tester_user_id
    from public.test_responses owner_responses
    join public.submissions tester_submissions
      on tester_submissions.id = owner_responses.submission_id
    where owner_responses.tester_user_id = p_owner_user_id
      and owner_responses.status = 'approved'
      and owner_responses.credit_awarded = true
  ),
  penalized_testers as (
    select distinct sequences.tester_user_id
    from public.test_back_reminder_sequences sequences
    where sequences.owner_user_id = p_owner_user_id
      and sequences.affects_test_back_rate = true
      and exists (
        select 1 from public.find_test_back_target_submission(
          sequences.tester_user_id, p_owner_user_id
        )
      )
  ),
  base_testers as (
    select
      inbound_testers.tester_user_id,
      reciprocated_testers.tester_user_id is not null as reciprocated,
      penalized_testers.tester_user_id is not null as penalized
    from inbound_testers
    left join reciprocated_testers
      on reciprocated_testers.tester_user_id = inbound_testers.tester_user_id
    left join penalized_testers
      on penalized_testers.tester_user_id = inbound_testers.tester_user_id

    union

    select
      p_pending_tester_user_id as tester_user_id,
      false as reciprocated,
      false as penalized
    where p_pending_tester_user_id is not null
      and not exists (
        select 1
        from inbound_testers
        where inbound_testers.tester_user_id = p_pending_tester_user_id
      )
  ),
  current_counts as (
    select
      count(*) filter (where reciprocated or penalized) as total_counted,
      count(*) filter (where reciprocated) as total_reciprocated
    from base_testers
  ),
  next_counts as (
    select
      count(*) filter (
        where reciprocated or penalized or (
          tester_user_id = p_pending_tester_user_id
          and exists (
            select 1 from public.find_test_back_target_submission(
              p_pending_tester_user_id, p_owner_user_id
            )
          )
        )
      ) as total_counted,
      count(*) filter (where reciprocated) as total_reciprocated
    from base_testers
  )
  select
    coalesce(
      round(100.0 * current_counts.total_reciprocated / nullif(current_counts.total_counted, 0))::integer,
      100
    ) as current_test_back_rate_percent,
    coalesce(
      round(100.0 * next_counts.total_reciprocated / nullif(next_counts.total_counted, 0))::integer,
      100
    ) as new_test_back_rate_percent
  from current_counts
  cross join next_counts;
$function$
;

notify pgrst, 'reload schema';
commit;
