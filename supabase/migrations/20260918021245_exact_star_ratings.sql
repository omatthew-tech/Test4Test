-- Exact stars are authoritative. Keep legacy values unchanged for audit.
-- Serialize this backfill with rating writes; suppress only historical notifications.
begin;
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
set search_path = ''
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
            ratings.star_rating * 20.0
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
      and submissions.is_open_for_more_tests = true
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
            ratings.star_rating * 20.0
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

-- Append stars while retaining the legacy output fields for older readers.
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

create or replace function public.list_home_trusted_submissions()
returns table (
  id uuid,
  product_name text,
  product_types text[],
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_submissions as (
    select
      submissions.id,
      submissions.user_id,
      submissions.product_name,
      coalesce(submissions.product_types, array[submissions.product_type]) as product_types,
      submissions.description,
      coalesce(submissions.promoted, false) as promoted,
      coalesce(submissions.response_count, 0) as response_count,
      submissions.created_at
    from public.submissions submissions
    where submissions.status = 'live'
      and submissions.is_open_for_more_tests = true
      and submissions.reward_type = 'credit'
      and submissions.needs_google_play_closed_testers = false
      and submissions.user_id is not null
      and public.profile_is_clear(submissions.user_id)
  ),
  owners as materialized (
    select distinct user_id from eligible_submissions
  ),
  balances as (
    select transactions.user_id, sum(transactions.amount)::integer as credit_balance
    from public.credit_transactions transactions join owners on owners.user_id = transactions.user_id
    group by transactions.user_id
  ),
  completed as materialized (
    select responses.id, responses.tester_user_id
    from public.test_responses responses join owners on owners.user_id = responses.tester_user_id
    where responses.status = 'approved' and responses.credit_awarded = true
  ),
  satisfaction as (
    select completed.tester_user_id, round(avg(ratings.star_rating * 20.0))::integer as rate
    from completed join public.feedback_ratings ratings on ratings.test_response_id = completed.id
    group by completed.tester_user_id
  ),
  completed_owners as (
    select distinct tester_user_id from completed
  ),
  owner_metrics as (
    select owners.user_id, completed_owners.tester_user_id is not null as has_completed_test,
      coalesce(balances.credit_balance, 0) as credit_balance,
      rates.owner_test_back_rate_percent as test_back_rate_percent,
      coalesce(satisfaction.rate, 100) as satisfaction_rate_percent
    from owners
    left join balances on balances.user_id = owners.user_id
    left join satisfaction on satisfaction.tester_user_id = owners.user_id
    left join completed_owners on completed_owners.tester_user_id = owners.user_id
    join lateral public.get_effective_test_back_rate_for_owner(owners.user_id) rates on true
  )
  select
    eligible_submissions.id,
    eligible_submissions.product_name,
    eligible_submissions.product_types,
    eligible_submissions.description
  from eligible_submissions
  join owner_metrics
    on owner_metrics.user_id = eligible_submissions.user_id
  order by
    eligible_submissions.promoted desc,
    owner_metrics.credit_balance desc,
    case
      when owner_metrics.has_completed_test then owner_metrics.test_back_rate_percent
      else 0
    end desc,
    case
      when owner_metrics.has_completed_test then owner_metrics.satisfaction_rate_percent
      else 0
    end desc,
    eligible_submissions.response_count asc,
    eligible_submissions.created_at desc
  limit 6;
$$;

create or replace function public.revise_test_recording(
  p_response_id uuid, p_recording_bucket text, p_recording_path text,
  p_duration_seconds integer, p_expected_version_number integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_response public.test_responses%rowtype;
  v_submission public.submissions%rowtype;
  v_upload public.test_response_recording_uploads%rowtype;
  v_previous public.test_response_versions%rowtype;
  v_version public.test_response_versions%rowtype;
begin
  if v_user is null or not public.current_user_has_app_access() then
    raise exception 'Sign in with an active account to revise feedback.';
  end if;
  if p_expected_version_number is null or p_expected_version_number < 1 then
    raise exception 'Reload your submitted feedback before revising it.';
  end if;
  select * into v_response from public.test_responses
  where id = p_response_id and tester_user_id = v_user for update;
  if not found then raise exception 'That feedback could not be found.'; end if;

  -- Resolve retries before checking the rating, which was cleared on successful submission.
  select * into v_version from public.test_response_versions
  where response_id = p_response_id and recording_bucket = p_recording_bucket and recording_path = p_recording_path
    and version_number = p_expected_version_number + 1;
  if found then
    return jsonb_build_object('ok', true, 'responseId', p_response_id, 'versionId', v_version.id,
      'versionNumber', v_version.version_number, 'message', 'Revised recording submitted.');
  end if;
  select * into v_previous from public.test_response_versions
  where response_id = p_response_id order by version_number desc limit 1;
  if v_previous.version_number is distinct from p_expected_version_number then
    raise exception 'This feedback has changed. Reload it before submitting a revision.';
  end if;
  select * into v_submission from public.submissions where id = v_response.submission_id for share;
  if v_submission.status <> 'live' or not public.profile_is_clear(v_submission.user_id) then
    raise exception 'That test is no longer open for revisions.';
  end if;
  if exists(select 1 from public.feedback_rating_reports where test_response_id = p_response_id and status = 'pending') then
    raise exception 'That feedback is currently under review.';
  end if;
  perform 1 from public.feedback_ratings where test_response_id = p_response_id
    and rated_by_user_id = v_submission.user_id and star_rating between 1 and 4 for update;
  if not found then raise exception 'Only feedback rated 1–4 stars can be revised.'; end if;
  if p_recording_bucket is distinct from 'r2:test-response-recordings' or nullif(trim(p_recording_path), '') is null then
    raise exception 'Upload a new screen and voice recording before submitting your revision.';
  end if;
  select * into v_upload from public.test_response_recording_uploads
  where storage_bucket = p_recording_bucket and object_key = p_recording_path
    and tester_user_id = v_user and status = 'completed' and attached_response_id is null for update;
  if not found or split_part(p_recording_path, '/', 1) <> 'draft'
    or split_part(p_recording_path, '/', 2) <> v_user::text or v_upload.file_size_bytes <= 0 then
    raise exception 'The completed recording upload could not be found.';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 0 then raise exception 'Invalid recording duration.'; end if;

  update public.test_response_versions set rating_snapshot =
    coalesce((select jsonb_agg(to_jsonb(f)) from public.feedback_ratings f where f.test_response_id = p_response_id), '[]')
  where id = v_previous.id;
  insert into public.test_response_versions(response_id, version_number, submitted_at, duration_seconds,
    recording_bucket, recording_path, recording_file_name, recording_mime_type,
    recording_file_size_bytes, recording_uploaded_at, thumbnail_bucket, thumbnail_path)
  values(p_response_id, v_previous.version_number + 1, now(), p_duration_seconds,
    p_recording_bucket, p_recording_path, v_upload.file_name, v_upload.mime_type,
    v_upload.file_size_bytes, coalesce(v_upload.uploaded_at, now()), v_upload.thumbnail_storage_bucket,
    v_upload.thumbnail_path) returning * into v_version;

  update public.test_response_recording_uploads set attached_response_id = p_response_id, updated_at = now()
    where id = v_upload.id;
  update public.test_responses set answers = '[]', duration_seconds = p_duration_seconds,
    submitted_at = v_version.submitted_at, recording_bucket = p_recording_bucket, recording_path = p_recording_path,
    recording_file_name = v_upload.file_name, recording_mime_type = v_upload.mime_type,
    recording_file_size_bytes = v_upload.file_size_bytes, recording_uploaded_at = v_version.recording_uploaded_at,
    recording_deleted_at = null, recording_expires_at = null
  where id = p_response_id;
  delete from public.feedback_ratings where test_response_id = p_response_id;
  return jsonb_build_object('ok', true, 'responseId', p_response_id, 'versionId', v_version.id,
    'versionNumber', v_version.version_number, 'message', 'Revised recording submitted.');
end;
$$;

create or replace function private.lock_pending_rating_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    perform 1 from public.test_responses where id = new.test_response_id for update;
    perform 1 from public.feedback_ratings f
      join public.test_responses r on r.id = f.test_response_id
      join public.submissions s on s.id = r.submission_id
      where f.test_response_id = new.test_response_id and f.rated_by_user_id = s.user_id
        and f.star_rating between 1 and 4 for update of f;
    if not found then
      raise exception 'This rating has changed. Reload your submitted feedback.';
    end if;
  end if;
  return new;
end;
$$;

-- Recreating the RPC requires restoring its intended authenticated-only grant.
revoke all on function public.get_my_submitted_feedback_cards() from public, anon;
grant execute on function public.get_my_submitted_feedback_cards() to authenticated;

-- Reserve a report before external notification. Row locks serialize reports,
-- revisions, and rating changes; repeated pending requests never notify twice.
create or replace function public.claim_feedback_rating_report(
  p_response_id uuid, p_reporter_user_id uuid, p_expected_stars smallint, p_message text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_response public.test_responses%rowtype;
  v_rating smallint;
  v_report public.feedback_rating_reports%rowtype;
begin
  select * into v_response from public.test_responses where id = p_response_id for update;
  if not found or p_reporter_user_id is null or v_response.tester_user_id is distinct from p_reporter_user_id
     or public.profile_is_clear(p_reporter_user_id) is not true then
    raise exception 'You do not have permission to report this rating.';
  end if;
  select * into v_report from public.feedback_rating_reports
    where test_response_id = p_response_id and reporter_user_id = p_reporter_user_id for update;
  if found and v_report.status = 'pending' then
    return jsonb_build_object('claimed', false, 'reportId', v_report.id);
  end if;
  select f.star_rating into v_rating from public.feedback_ratings f
    join public.submissions s on s.id = v_response.submission_id
    where f.test_response_id = p_response_id and f.rated_by_user_id = s.user_id for update of f;
  if not found or v_rating not between 1 and 4 or v_rating is distinct from p_expected_stars then
    raise exception 'This rating has changed. Reload your submitted feedback.';
  end if;
  insert into public.feedback_rating_reports(test_response_id,reporter_user_id,status,message,updated_at)
    values(p_response_id,p_reporter_user_id,'pending',p_message,now())
    on conflict(test_response_id,reporter_user_id) do update
      set status='pending',message=excluded.message,updated_at=excluded.updated_at
    returning * into v_report;
  return jsonb_build_object('claimed', true, 'reportId', v_report.id);
end;
$$;
revoke all on function public.claim_feedback_rating_report(uuid,uuid,smallint,text) from public, anon, authenticated;
grant execute on function public.claim_feedback_rating_report(uuid,uuid,smallint,text) to service_role;
commit;
