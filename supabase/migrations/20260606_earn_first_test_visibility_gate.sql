create or replace function public.user_has_completed_credited_test(
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.test_responses responses
      where responses.tester_user_id = p_user_id
        and responses.status = 'approved'
        and responses.credit_awarded = true
    );
$$;

grant execute on function public.user_has_completed_credited_test(uuid) to authenticated;
grant execute on function public.user_has_completed_credited_test(uuid) to anon;

create or replace function public.prevent_locked_submission_owner_test_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
begin
  select submissions.user_id
  into v_owner_user_id
  from public.submissions submissions
  where submissions.id = new.submission_id;

  if v_owner_user_id is not null
     and not public.user_has_completed_credited_test(v_owner_user_id) then
    raise exception 'This test is not listed yet because its owner needs to complete one test first.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_submission_owner_test_response_on_test_responses
  on public.test_responses;
create trigger prevent_locked_submission_owner_test_response_on_test_responses
  before insert on public.test_responses
  for each row
  execute procedure public.prevent_locked_submission_owner_test_response();

create or replace function public.list_earn_submissions(
  p_product_types text[]
)
returns table (
  id uuid,
  user_id uuid,
  product_name text,
  product_type text,
  product_types text[],
  description text,
  target_audience text,
  instructions text,
  google_play_closed_test_instructions text,
  access_url text,
  access_method text,
  access_links jsonb,
  requires_recording boolean,
  needs_google_play_closed_testers boolean,
  status text,
  question_mode text,
  is_open_for_more_tests boolean,
  estimated_minutes integer,
  response_count integer,
  last_response_at timestamptz,
  promoted boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_types text[];
  v_needs_google_play_closed_testers boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in to browse Earn tests.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select coalesce(
    array_agg(normalized.product_type order by array_position(array['website', 'ios', 'android']::text[], normalized.product_type)),
    array[]::text[]
  )
  into v_product_types
  from (
    select distinct unnest(coalesce(p_product_types, array[]::text[])) as product_type
  ) normalized
  where normalized.product_type = any (array['website', 'ios', 'android']::text[]);

  if cardinality(v_product_types) = 0 then
    return;
  end if;

  v_needs_google_play_closed_testers := public.user_is_google_play_closed_test_pool(v_user_id);

  return query
  select
    submissions.id,
    submissions.user_id,
    submissions.product_name,
    submissions.product_type,
    coalesce(submissions.product_types, array[submissions.product_type]),
    submissions.description,
    submissions.target_audience,
    submissions.instructions,
    submissions.google_play_closed_test_instructions,
    submissions.access_url,
    submissions.access_method,
    submissions.access_links,
    submissions.requires_recording,
    submissions.needs_google_play_closed_testers,
    submissions.status,
    submissions.question_mode,
    submissions.is_open_for_more_tests,
    submissions.estimated_minutes,
    submissions.response_count,
    submissions.last_response_at,
    coalesce(submissions.promoted, false),
    submissions.created_at
  from public.submissions submissions
  where submissions.status = 'live'
    and submissions.user_id <> v_user_id
    and submissions.is_open_for_more_tests = true
    and submissions.needs_google_play_closed_testers = v_needs_google_play_closed_testers
    and public.profile_is_clear(submissions.user_id)
    and public.user_has_completed_credited_test(submissions.user_id)
    and coalesce(submissions.product_types, array[submissions.product_type]) && v_product_types
    and not exists (
      select 1
      from public.test_responses responses
      where responses.submission_id = submissions.id
        and responses.tester_user_id = v_user_id
    )
  order by
    coalesce(submissions.promoted, false) desc,
    submissions.response_count asc,
    submissions.created_at desc;
end;
$$;

grant execute on function public.list_earn_submissions(text[]) to authenticated;

drop function if exists public.get_my_earn_visibility_summary();
create or replace function public.get_my_earn_visibility_summary()
returns table (
  submission_id uuid,
  product_name text,
  has_completed_test boolean,
  rank integer,
  ranked_submission_count integer,
  would_rank integer,
  would_ranked_submission_count integer,
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
      public.user_has_completed_credited_test(v_user_id) as has_completed_test,
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
      and public.user_has_completed_credited_test(submissions.user_id)
  ),
  private_rankable_submissions as (
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
      and (
        public.user_has_completed_credited_test(submissions.user_id)
        or submissions.id = live_submission.id
      )
  ),
  private_rankable_owners as (
    select distinct private_rankable_submissions.user_id
    from private_rankable_submissions
  ),
  owner_metrics as (
    select
      private_rankable_owners.user_id,
      coalesce((
        select sum(transactions.amount)
        from public.credit_transactions transactions
        where transactions.user_id = private_rankable_owners.user_id
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
        where rated_responses.tester_user_id = private_rankable_owners.user_id
          and rated_responses.status = 'approved'
          and rated_responses.credit_awarded = true
      ), 100) as satisfaction_rate_percent
    from private_rankable_owners
    join lateral public.get_effective_test_back_rate_for_owner(private_rankable_owners.user_id) rates
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
  ),
  private_ranked_submissions as (
    select
      private_rankable_submissions.id,
      (row_number() over (
        order by
          owner_metrics.token_balance desc,
          private_rankable_submissions.promoted desc,
          (
            owner_metrics.owner_test_back_rate_percent +
            owner_metrics.satisfaction_rate_percent
          ) desc,
          private_rankable_submissions.response_count asc,
          private_rankable_submissions.created_at desc,
          private_rankable_submissions.id desc
      ))::integer as rank,
      (count(*) over ())::integer as ranked_submission_count
    from private_rankable_submissions
    join owner_metrics
      on owner_metrics.user_id = private_rankable_submissions.user_id
  )
  select
    live_submission.id as submission_id,
    live_submission.product_name,
    current_metrics.has_completed_test,
    ranked_submissions.rank,
    coalesce(ranked_submissions.ranked_submission_count, 0) as ranked_submission_count,
    private_ranked_submissions.rank as would_rank,
    coalesce(private_ranked_submissions.ranked_submission_count, 0) as would_ranked_submission_count,
    current_metrics.token_balance,
    case
      when current_metrics.has_completed_test then current_metrics.owner_test_back_rate_percent
      else null
    end as test_back_rate_percent,
    case
      when current_metrics.has_completed_test then current_metrics.satisfaction_rate_percent
      else null
    end as satisfaction_rate_percent
  from current_metrics
  left join live_submission on true
  left join ranked_submissions
    on ranked_submissions.id = live_submission.id
  left join private_ranked_submissions
    on private_ranked_submissions.id = live_submission.id;
end;
$$;

grant execute on function public.get_my_earn_visibility_summary() to authenticated;
