alter table public.test_back_reminder_sequences
  add column if not exists affects_test_back_rate boolean not null default false;

update public.test_back_reminder_sequences
set affects_test_back_rate = true
where resolved_reason = 'sequence_complete'
   or emails_sent >= 3;

drop function if exists public.get_effective_test_back_rate_for_owner(uuid);
create or replace function public.get_effective_test_back_rate_for_owner(
  p_owner_user_id uuid
)
returns table (
  owner_user_id uuid,
  included_inbound_tester_count integer,
  reciprocated_inbound_tester_count integer,
  owner_test_back_rate_percent integer
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

drop function if exists public.get_test_back_rate_transition(uuid, uuid);
create or replace function public.get_test_back_rate_transition(
  p_owner_user_id uuid,
  p_pending_tester_user_id uuid
)
returns table (
  current_test_back_rate_percent integer,
  new_test_back_rate_percent integer
)
language sql
stable
security definer
set search_path = public
as $$
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
        where reciprocated or penalized or tester_user_id = p_pending_tester_user_id
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
$$;

with outstanding_pairs as (
  select distinct on (submissions.user_id, responses.tester_user_id)
    submissions.user_id as owner_user_id,
    responses.tester_user_id,
    responses.id as latest_triggering_response_id,
    responses.submission_id as latest_triggering_submission_id
  from public.test_responses responses
  join public.submissions submissions
    on submissions.id = responses.submission_id
  where responses.status = 'approved'
    and responses.credit_awarded = true
    and submissions.user_id <> responses.tester_user_id
    and public.profile_is_clear(submissions.user_id)
    and public.profile_is_clear(responses.tester_user_id)
    and not exists (
      select 1
      from public.test_responses reciprocated_responses
      join public.submissions reciprocated_submissions
        on reciprocated_submissions.id = reciprocated_responses.submission_id
      where reciprocated_responses.tester_user_id = submissions.user_id
        and reciprocated_responses.status = 'approved'
        and reciprocated_responses.credit_awarded = true
        and reciprocated_submissions.user_id = responses.tester_user_id
    )
    and exists (
      select 1
      from public.find_test_back_target_submission(
        responses.tester_user_id,
        submissions.user_id
      ) as target_submission
    )
  order by submissions.user_id, responses.tester_user_id, responses.submitted_at desc, responses.id desc
)
insert into public.test_back_reminder_sequences (
  owner_user_id,
  tester_user_id,
  latest_triggering_response_id,
  latest_triggering_submission_id,
  emails_sent,
  next_send_at,
  status,
  resolved_reason,
  affects_test_back_rate,
  last_sent_at,
  resolved_at
)
select
  outstanding_pairs.owner_user_id,
  outstanding_pairs.tester_user_id,
  outstanding_pairs.latest_triggering_response_id,
  outstanding_pairs.latest_triggering_submission_id,
  0 as emails_sent,
  timezone('utc', now()) as next_send_at,
  'pending' as status,
  null as resolved_reason,
  false as affects_test_back_rate,
  null as last_sent_at,
  null as resolved_at
from outstanding_pairs
on conflict (owner_user_id, tester_user_id) do nothing;

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
    owner_metrics.owner_test_back_rate_percent,
    owner_metrics.owner_satisfaction_rate_percent
  from visible_submissions
  join owner_metrics
    on owner_metrics.owner_user_id = visible_submissions.owner_user_id
  order by visible_submissions.submission_id;
end;
$$;

drop function if exists public.get_my_submitted_feedback_cards();
create or replace function public.get_my_submitted_feedback_cards()
returns table (
  response_id uuid,
  submission_id uuid,
  product_name text,
  product_types text[],
  description text,
  submitted_at timestamptz,
  rating_value text,
  owner_test_back_rate_percent integer,
  owner_satisfaction_rate_percent integer,
  submission_status text,
  report_status text
)
language plpgsql
security definer
set search_path = public
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
    authored_responses.submitted_at,
    ratings.rating_value,
    owner_metrics.owner_test_back_rate_percent,
    owner_metrics.owner_satisfaction_rate_percent,
    authored_responses.submission_status,
    reports.status as report_status
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

grant execute on function public.get_effective_test_back_rate_for_owner(uuid) to authenticated;
grant execute on function public.get_test_back_rate_transition(uuid, uuid) to authenticated;
grant execute on function public.get_earn_submission_reputation(uuid[]) to authenticated;
grant execute on function public.get_my_submitted_feedback_cards() to authenticated;

update public.email_templates
set subject_template = 'Your test-back rate dropped to {{newTestBackRatePercent}}%',
    text_template = $stage_3_text$
Hey tester,

You still have not tested back another user's app.

Your test-back rate dropped from {{currentTestBackRatePercent}}% to {{newTestBackRatePercent}}%. This may result in less visibility and less user feedback for {{ownerProductName}}.

View test:
{{testBackUrl}}

Don't worry! You can always test back any time.

Happy Testing!
$stage_3_text$,
    html_template = $stage_3_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hey tester,</p>
  <p>You still have not tested back another user's app.</p>
  <p>
    Your test-back rate dropped from <strong>{{currentTestBackRatePercent}}%</strong> to
    <strong>{{newTestBackRatePercent}}%</strong>. This may result in less visibility and less
    user feedback for <strong>{{ownerProductName}}</strong>.
  </p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #8f2f20; color: #fffaf6; text-decoration: none; font-weight: 600;">
      View test
    </a>
  </p>
  <p>Don't worry! You can always test back any time.</p>
  <p>Happy Testing!</p>
</div>
$stage_3_html$,
    updated_at = timezone('utc', now())
where key = 'test_back_reminder_stage_3';

