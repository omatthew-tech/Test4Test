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
