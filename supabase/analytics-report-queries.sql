-- Unique site visitors by day.
select
  date_trunc('day', created_at at time zone 'America/New_York')::date as day,
  count(distinct visitor_id) as unique_visitors
from public.analytics_events
where event_name = 'site_visited'
group by 1
order by 1 desc;

-- Visitors who entered an app/site name by day. The name itself is not stored.
select
  date_trunc('day', created_at at time zone 'America/New_York')::date as day,
  count(distinct visitor_id) as visitors_with_name_entered
from public.analytics_events
where event_name = 'product_name_entered'
group by 1
order by 1 desc;

-- Furthest submit step reached per visitor/session.
with step_events as (
  select
    visitor_id,
    session_id,
    max((metadata ->> 'stepIndex')::integer) as furthest_step_index
  from public.analytics_events
  where event_name = 'submit_step_viewed'
    and metadata ? 'stepIndex'
  group by visitor_id, session_id
)
select
  furthest_step_index,
  count(*) as sessions
from step_events
group by furthest_step_index
order by furthest_step_index;

-- Signup funnel by day.
select
  date_trunc('day', created_at at time zone 'America/New_York')::date as day,
  count(distinct visitor_id) filter (where event_name = 'site_visited') as visitors,
  count(distinct visitor_id) filter (where event_name = 'email_signup_requested') as requested_email_code,
  count(distinct visitor_id) filter (where event_name = 'email_verified') as verified_email
from public.analytics_events
where event_name in ('site_visited', 'email_signup_requested', 'email_verified')
group by 1
order by 1 desc;

-- First-test funnel by day.
select
  date_trunc('day', created_at at time zone 'America/New_York')::date as day,
  count(distinct user_id) filter (where event_name = 'email_verified') as verified_users,
  count(distinct user_id) filter (where event_name = 'test_started') as users_started_test,
  count(distinct user_id) filter (where event_name = 'first_test_completed') as users_completed_first_test
from public.analytics_events
where event_name in ('email_verified', 'test_started', 'first_test_completed')
  and user_id is not null
group by 1
order by 1 desc;

-- Authenticated visits by user and timestamp.
select
  user_id,
  visitor_id,
  session_id,
  created_at
from public.analytics_events
where event_name = 'authenticated_visit'
  and user_id is not null
order by created_at desc;

-- Authenticated visits where a test was completed in the same browser session.
with authenticated_visits as (
  select user_id, visitor_id, session_id, created_at
  from public.analytics_events
  where event_name = 'authenticated_visit'
    and user_id is not null
),
session_completions as (
  select distinct user_id, session_id
  from public.analytics_events
  where event_name = 'test_completed'
    and user_id is not null
)
select
  date_trunc('day', visits.created_at at time zone 'America/New_York')::date as day,
  count(*) as authenticated_visits,
  count(*) filter (where completions.session_id is not null) as authenticated_visits_with_test_completed
from authenticated_visits visits
left join session_completions completions
  on completions.user_id = visits.user_id
 and completions.session_id = visits.session_id
group by 1
order by 1 desc;
