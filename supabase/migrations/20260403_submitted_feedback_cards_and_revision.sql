drop function if exists public.get_my_submitted_feedback_cards();
drop function if exists public.revise_test_response(uuid, jsonb, integer);

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
  submission_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to load submitted feedback.';
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
      submissions.status as submission_status
    from public.test_responses responses
    join public.submissions submissions
      on submissions.id = responses.submission_id
    where responses.tester_user_id = auth.uid()
  ),
  owner_metrics as (
    select
      owners.owner_user_id,
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
      select distinct authored_responses.owner_user_id
      from authored_responses
    ) owners
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
    authored_responses.submission_status
  from authored_responses
  left join public.feedback_ratings ratings
    on ratings.test_response_id = authored_responses.response_id
   and ratings.rated_by_user_id = authored_responses.owner_user_id
  join owner_metrics
    on owner_metrics.owner_user_id = authored_responses.owner_user_id
  order by authored_responses.submitted_at desc;
end;
$$;

create or replace function public.revise_test_response(
  p_response_id uuid,
  p_answers jsonb,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_response public.test_responses%rowtype;
  v_submission public.submissions%rowtype;
  v_question_set public.question_set_versions%rowtype;
  v_paragraph_count integer := 0;
  v_distinct_paragraph_count integer := 0;
  v_avg_paragraph_length numeric := 120;
  v_duplicate_penalty integer := 0;
  v_min_length_penalty integer := 0;
  v_duration_penalty integer := 0;
  v_quality_score integer := 0;
  v_flags text[] := '{}';
  v_credit_awarded boolean := false;
  v_status text := 'approved';
  v_effective_duration integer := 0;
  v_message text;
begin
  if v_user_id is null then
    raise exception 'Verify your email before revising feedback.';
  end if;

  select *
  into v_response
  from public.test_responses responses
  where responses.id = p_response_id
    and responses.tester_user_id = v_user_id;

  if not found then
    raise exception 'That submission could not be found.';
  end if;

  select *
  into v_submission
  from public.submissions submissions
  where submissions.id = v_response.submission_id;

  if not found then
    raise exception 'That test could not be loaded.';
  end if;

  if v_submission.status <> 'live' then
    raise exception 'That test is no longer open for revisions.';
  end if;

  select *
  into v_question_set
  from public.question_set_versions versions
  where versions.id = v_response.question_set_version_id
  limit 1;

  if not found then
    raise exception 'That question set is unavailable.';
  end if;

  v_effective_duration := greatest(coalesce(p_duration_seconds, 0), v_response.duration_seconds);

  select
    count(*),
    count(distinct lower(trim(coalesce(item ->> 'textAnswer', '')))) filter (where trim(coalesce(item ->> 'textAnswer', '')) <> ''),
    coalesce(avg(length(trim(coalesce(item ->> 'textAnswer', '')))) filter (where trim(coalesce(item ->> 'textAnswer', '')) <> ''), 120)
  into v_paragraph_count, v_distinct_paragraph_count, v_avg_paragraph_length
  from jsonb_array_elements(p_answers) item
  where item ->> 'type' = 'paragraph';

  if exists (
    select 1
    from jsonb_array_elements(p_answers) item
    where item ->> 'type' = 'paragraph'
      and length(trim(coalesce(item ->> 'textAnswer', ''))) < 40
  ) then
    v_min_length_penalty := 18;
    v_flags := array_append(v_flags, 'Open-text responses are too short');
  end if;

  if v_paragraph_count > 0 and v_distinct_paragraph_count <> v_paragraph_count then
    v_duplicate_penalty := 22;
    v_flags := array_append(v_flags, 'Duplicate text detected');
  end if;

  if v_effective_duration < 150 then
    v_duration_penalty := 14;
    v_flags := array_append(v_flags, 'Finished unusually quickly');
  end if;

  v_quality_score := greatest(
    12,
    least(
      99,
      floor(48 + (v_avg_paragraph_length / 2.3) - v_duplicate_penalty - v_min_length_penalty - v_duration_penalty)
    )
  );

  v_credit_awarded := v_quality_score >= 55;
  v_status := case when v_credit_awarded then 'approved' else 'flagged' end;

  update public.test_responses
  set answers = p_answers,
      duration_seconds = v_effective_duration,
      quality_score = v_quality_score,
      credit_awarded = v_credit_awarded,
      status = v_status,
      submitted_at = timezone('utc', now()),
      internal_flags = v_flags
  where id = p_response_id;

  delete from public.feedback_ratings
  where test_response_id = p_response_id;

  if v_response.credit_awarded = false and v_credit_awarded = true then
    insert into public.credit_transactions (
      user_id,
      type,
      amount,
      reason,
      related_test_response_id
    ) values (
      v_user_id,
      'adjustment',
      1,
      'Approved revised usability feedback',
      p_response_id
    );
  elsif v_response.credit_awarded = true and v_credit_awarded = false then
    insert into public.credit_transactions (
      user_id,
      type,
      amount,
      reason,
      related_test_response_id
    ) values (
      v_user_id,
      'revocation',
      -1,
      'Revised usability feedback fell below the quality threshold',
      p_response_id
    );
  end if;

  if v_credit_awarded then
    v_message := 'Feedback revised. The app owner can review it again.';
  else
    v_message := 'We saved your revision, but it still needs more detail before it can be approved.';
  end if;

  return jsonb_build_object(
    'responseId', p_response_id,
    'ok', v_credit_awarded,
    'message', v_message,
    'status', v_status,
    'qualityScore', v_quality_score,
    'creditAwarded', v_credit_awarded
  );
end;
$$;

grant execute on function public.get_my_submitted_feedback_cards() to authenticated;
grant execute on function public.revise_test_response(uuid, jsonb, integer) to authenticated;