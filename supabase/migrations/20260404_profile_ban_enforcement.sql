alter table public.profiles
  add column if not exists ban_status text not null default 'clear',
  add column if not exists banned_at timestamptz;

update public.profiles
set ban_status = 'clear'
where ban_status is null;

alter table public.profiles
  drop constraint if exists profiles_ban_status_valid;

alter table public.profiles
  add constraint profiles_ban_status_valid
  check (ban_status in ('clear', 'banned'));

create or replace function public.current_user_has_app_access()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null then true
    else coalesce(
      (
        select profiles.ban_status = 'clear'
        from public.profiles profiles
        where profiles.id = auth.uid()
      ),
      true
    )
  end;
$$;

create or replace function public.profile_is_clear(p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select profiles.ban_status = 'clear'
      from public.profiles profiles
      where profiles.id = p_profile_id
    ),
    false
  );
$$;

grant execute on function public.current_user_has_app_access() to anon, authenticated;
grant execute on function public.profile_is_clear(uuid) to anon, authenticated;

create or replace view public.announcement_recipients as
select
  id,
  email,
  display_name
from public.profiles
where ban_status = 'clear'
  and nullif(trim(email), '') is not null;

drop policy if exists "submissions_select_live_or_own" on public.submissions;
create policy "submissions_select_live_or_own"
  on public.submissions for select
  using (
    (
      auth.uid() = user_id
      and public.current_user_has_app_access()
    )
    or (
      status = 'live'
      and public.profile_is_clear(user_id)
      and (auth.uid() is null or public.current_user_has_app_access())
    )
  );

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own"
  on public.submissions for insert
  with check (
    auth.uid() = user_id
    and public.current_user_has_app_access()
  );

drop policy if exists "submissions_update_own" on public.submissions;
create policy "submissions_update_own"
  on public.submissions for update
  using (
    auth.uid() = user_id
    and public.current_user_has_app_access()
  )
  with check (
    auth.uid() = user_id
    and public.current_user_has_app_access()
  );

drop policy if exists "question_sets_select_live_or_own" on public.question_set_versions;
create policy "question_sets_select_live_or_own"
  on public.question_set_versions for select
  using (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and (
          submissions.user_id = auth.uid()
          or (
            submissions.status = 'live'
            and public.profile_is_clear(submissions.user_id)
          )
        )
    )
  );

drop policy if exists "question_sets_insert_own" on public.question_set_versions;
create policy "question_sets_insert_own"
  on public.question_set_versions for insert
  with check (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and submissions.user_id = auth.uid()
    )
  );

drop policy if exists "question_sets_update_own" on public.question_set_versions;
create policy "question_sets_update_own"
  on public.question_set_versions for update
  using (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and submissions.user_id = auth.uid()
    )
  )
  with check (
    public.current_user_has_app_access()
    and exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and submissions.user_id = auth.uid()
    )
  );
drop policy if exists "responses_select_related" on public.test_responses;
create policy "responses_select_related"
  on public.test_responses for select
  using (
    public.current_user_has_app_access()
    and (
      tester_user_id = auth.uid()
      or exists (
        select 1
        from public.submissions submissions
        where submissions.id = test_responses.submission_id
          and submissions.user_id = auth.uid()
      )
    )
  );

drop policy if exists "feedback_ratings_select_related" on public.feedback_ratings;
create policy "feedback_ratings_select_related"
  on public.feedback_ratings for select
  using (
    public.current_user_has_app_access()
    and (
      rated_by_user_id = auth.uid()
      or exists (
        select 1
        from public.test_responses responses
        join public.submissions submissions on submissions.id = responses.submission_id
        where responses.id = feedback_ratings.test_response_id
          and submissions.user_id = auth.uid()
      )
    )
  );

drop policy if exists "feedback_ratings_upsert_owner" on public.feedback_ratings;
create policy "feedback_ratings_upsert_owner"
  on public.feedback_ratings for insert
  with check (
    public.current_user_has_app_access()
    and rated_by_user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      join public.submissions submissions on submissions.id = responses.submission_id
      where responses.id = feedback_ratings.test_response_id
        and submissions.user_id = auth.uid()
    )
  );

drop policy if exists "feedback_ratings_update_owner" on public.feedback_ratings;
create policy "feedback_ratings_update_owner"
  on public.feedback_ratings for update
  using (
    public.current_user_has_app_access()
    and rated_by_user_id = auth.uid()
  )
  with check (
    public.current_user_has_app_access()
    and rated_by_user_id = auth.uid()
  );

drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own"
  on public.credit_transactions for select
  using (
    user_id = auth.uid()
    and public.current_user_has_app_access()
  );

drop policy if exists "test_response_favorites_select_own" on public.test_response_favorites;
create policy "test_response_favorites_select_own"
  on public.test_response_favorites for select
  using (
    public.current_user_has_app_access()
    and user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = test_response_favorites.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );

drop policy if exists "test_response_favorites_insert_own" on public.test_response_favorites;
create policy "test_response_favorites_insert_own"
  on public.test_response_favorites for insert
  with check (
    public.current_user_has_app_access()
    and user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = test_response_favorites.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );

drop policy if exists "test_response_favorites_delete_own" on public.test_response_favorites;
create policy "test_response_favorites_delete_own"
  on public.test_response_favorites for delete
  using (
    public.current_user_has_app_access()
    and user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = test_response_favorites.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );

drop policy if exists "feedback_rating_reports_select_own" on public.feedback_rating_reports;
create policy "feedback_rating_reports_select_own"
  on public.feedback_rating_reports for select
  using (
    reporter_user_id = auth.uid()
    and public.current_user_has_app_access()
  );

drop policy if exists "feedback_rating_reports_insert_own" on public.feedback_rating_reports;
create policy "feedback_rating_reports_insert_own"
  on public.feedback_rating_reports for insert
  with check (
    reporter_user_id = auth.uid()
    and public.current_user_has_app_access()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = feedback_rating_reports.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );

drop policy if exists "feedback_rating_reports_update_own" on public.feedback_rating_reports;
create policy "feedback_rating_reports_update_own"
  on public.feedback_rating_reports for update
  using (
    reporter_user_id = auth.uid()
    and public.current_user_has_app_access()
  )
  with check (
    reporter_user_id = auth.uid()
    and public.current_user_has_app_access()
  );
drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer);
create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_links jsonb,
  p_question_mode text,
  p_questions jsonb,
  p_estimated_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_product_types text[];
  v_primary_product_type text;
  v_primary_access_url text;
  v_access_links jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a submission.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  if p_access_links is not null and jsonb_typeof(p_access_links) <> 'object' then
    raise exception 'Provide app links as a JSON object keyed by app type.';
  end if;

  select coalesce(
    array_agg(product_type order by array_position(array['website', 'ios', 'android']::text[], product_type)),
    array['website']::text[]
  )
  into v_product_types
  from (
    select distinct unnest(coalesce(p_product_types, array[]::text[])) as product_type
  ) normalized
  where product_type = any (array['website', 'ios', 'android']::text[]);

  if coalesce(cardinality(v_product_types), 0) = 0 then
    raise exception 'Select at least one app type.';
  end if;

  if exists (
    select 1
    from unnest(v_product_types) as product_type
    where nullif(trim(coalesce(p_access_links ->> product_type, '')), '') is null
  ) then
    raise exception 'Add a public link for each selected app type.';
  end if;

  select coalesce(
    jsonb_object_agg(product_type, access_url),
    '{}'::jsonb
  )
  into v_access_links
  from (
    select product_type, trim(p_access_links ->> product_type) as access_url
    from unnest(v_product_types) as product_type
  ) normalized_links;

  v_primary_product_type := v_product_types[1];
  v_primary_access_url := v_access_links ->> v_primary_product_type;

  insert into public.submissions (
    user_id,
    product_name,
    product_type,
    product_types,
    description,
    target_audience,
    instructions,
    access_url,
    access_method,
    access_links,
    status,
    question_mode,
    is_open_for_more_tests,
    estimated_minutes
  ) values (
    v_user_id,
    trim(p_product_name),
    v_primary_product_type,
    v_product_types,
    coalesce(p_description, ''),
    coalesce(p_target_audience, ''),
    coalesce(p_instructions, ''),
    v_primary_access_url,
    '',
    v_access_links,
    'live',
    p_question_mode,
    true,
    greatest(coalesce(p_estimated_minutes, 5), 1)
  )
  returning id into v_submission_id;

  insert into public.question_set_versions (
    submission_id,
    version_number,
    is_active,
    mode,
    questions
  ) values (
    v_submission_id,
    1,
    true,
    p_question_mode,
    p_questions
  );

  return v_submission_id;
end;
$$;

drop function if exists public.update_question_set(uuid, text, jsonb, integer);
create or replace function public.update_question_set(
  p_submission_id uuid,
  p_mode text,
  p_questions jsonb,
  p_estimated_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_version integer;
  v_question_set_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update questions.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  if not exists (
    select 1
    from public.submissions submissions
    where submissions.id = p_submission_id
      and submissions.user_id = v_user_id
  ) then
    raise exception 'You do not have access to update this submission.';
  end if;

  update public.question_set_versions
  set is_active = false
  where submission_id = p_submission_id
    and is_active = true;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.question_set_versions
  where submission_id = p_submission_id;

  insert into public.question_set_versions (
    submission_id,
    version_number,
    is_active,
    mode,
    questions
  ) values (
    p_submission_id,
    v_next_version,
    true,
    p_mode,
    p_questions
  ) returning id into v_question_set_id;

  update public.submissions
  set question_mode = p_mode,
      estimated_minutes = greatest(coalesce(p_estimated_minutes, estimated_minutes), 1)
  where id = p_submission_id;

  return v_question_set_id;
end;
$$;
drop function if exists public.submit_test_response(uuid, jsonb, integer);
create or replace function public.submit_test_response(
  p_submission_id uuid,
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
  v_submission public.submissions%rowtype;
  v_question_set public.question_set_versions%rowtype;
  v_response_id uuid;
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
  v_message text;
  v_anonymous_label text;
begin
  if v_user_id is null then
    raise exception 'Verify your email before completing tests.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select *
  into v_submission
  from public.submissions submissions
  where submissions.id = p_submission_id
    and submissions.status = 'live'
    and public.profile_is_clear(submissions.user_id);

  if not found then
    raise exception 'That test could not be loaded.';
  end if;

  if v_submission.user_id = v_user_id then
    raise exception 'You cannot test your own submission.';
  end if;

  if exists (
    select 1
    from public.test_responses responses
    where responses.submission_id = p_submission_id
      and responses.tester_user_id = v_user_id
  ) then
    raise exception 'You have already completed this test.';
  end if;

  select *
  into v_question_set
  from public.question_set_versions versions
  where versions.submission_id = p_submission_id
    and versions.is_active = true
  limit 1;

  if not found then
    raise exception 'That question set is unavailable.';
  end if;

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

  if coalesce(p_duration_seconds, 0) < 150 then
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
  v_anonymous_label := format(
    'Tester %s',
    (select count(*) + 1 from public.test_responses responses where responses.submission_id = p_submission_id)
  );

  insert into public.test_responses (
    submission_id,
    tester_user_id,
    question_set_version_id,
    anonymous_label,
    status,
    quality_score,
    credit_awarded,
    duration_seconds,
    answers,
    internal_flags
  ) values (
    p_submission_id,
    v_user_id,
    v_question_set.id,
    v_anonymous_label,
    v_status,
    v_quality_score,
    v_credit_awarded,
    coalesce(p_duration_seconds, 0),
    p_answers,
    v_flags
  ) returning id into v_response_id;

  update public.submissions
  set response_count = response_count + 1,
      last_response_at = timezone('utc', now())
  where id = p_submission_id;

  if v_credit_awarded then
    insert into public.credit_transactions (
      user_id,
      type,
      amount,
      reason,
      related_test_response_id
    ) values (
      v_user_id,
      'earned_test',
      1,
      'Completed a usability test',
      v_response_id
    );

    v_message := 'Test submitted and credit awarded.';
  else
    v_message := 'Your submission was flagged for review. Please rewrite your responses to submit.';
  end if;

  return jsonb_build_object(
    'responseId', v_response_id,
    'ok', v_credit_awarded,
    'message', v_message,
    'status', v_status,
    'qualityScore', v_quality_score,
    'creditAwarded', v_credit_awarded
  );
end;
$$;
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
  )  select
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

drop function if exists public.revise_test_response(uuid, jsonb, integer);
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

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select *
  into v_response
  from public.test_responses responses
  where responses.id = p_response_id
    and responses.tester_user_id = v_user_id;

  if not found then
    raise exception 'That submission could not be found.';
  end if;

  if exists (
    select 1
    from public.feedback_rating_reports reports
    where reports.test_response_id = p_response_id
      and reports.reporter_user_id = v_user_id
      and reports.status = 'pending'
  ) then
    raise exception 'That feedback is currently under review.';
  end if;

  select *
  into v_submission
  from public.submissions submissions
  where submissions.id = v_response.submission_id;

  if not found then
    raise exception 'That test could not be loaded.';
  end if;

  if v_submission.status <> 'live' or not public.profile_is_clear(v_submission.user_id) then
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
  v_message := case
    when v_credit_awarded then 'Feedback revised and credit preserved.'
    else 'Your revised feedback is still below the review threshold. Please add more specific detail and try again.'
  end;

  update public.test_responses
  set answers = p_answers,
      duration_seconds = v_effective_duration,
      quality_score = v_quality_score,
      credit_awarded = v_credit_awarded,
      status = v_status,
      internal_flags = v_flags,
      submitted_at = timezone('utc', now())
  where id = p_response_id;

  delete from public.feedback_ratings
  where test_response_id = p_response_id;

  update public.feedback_rating_reports
  set status = 'dismissed',
      updated_at = timezone('utc', now())
  where test_response_id = p_response_id
    and reporter_user_id = v_user_id
    and status = 'pending';

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

grant execute on function public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer) to authenticated;
grant execute on function public.update_question_set(uuid, text, jsonb, integer) to authenticated;
grant execute on function public.submit_test_response(uuid, jsonb, integer) to authenticated;
grant execute on function public.get_earn_submission_reputation(uuid[]) to authenticated;
grant execute on function public.get_my_submitted_feedback_cards() to authenticated;
grant execute on function public.revise_test_response(uuid, jsonb, integer) to authenticated;