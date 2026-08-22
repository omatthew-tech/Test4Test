create schema if not exists private;
revoke all on schema private from public;

alter table public.profiles
  add column if not exists account_type text;

update public.profiles
set account_type = 'founder'
where account_type is null;

alter table public.profiles
  alter column account_type set default 'pending',
  alter column account_type set not null;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('pending', 'founder', 'tester'));

create table if not exists public.tester_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region text check (region is null or length(trim(region)) between 1 and 120),
  technology_proficiency text not null check (
    technology_proficiency in ('not_at_all', 'slightly', 'moderately', 'very', 'extremely')
  ),
  devices text[] not null check (
    cardinality(devices) > 0
    and devices <@ array['computer', 'ios', 'android']::text[]
  ),
  employment_status text not null check (
    employment_status in ('full_time', 'part_time', 'self_employed', 'student', 'retired', 'not_employed')
  ),
  work_area text check (
    work_area is null
    or work_area in (
      'sales',
      'marketing',
      'software_development',
      'it',
      'design_ux',
      'product_management',
      'finance_accounting',
      'human_resources',
      'operations',
      'healthcare',
      'education',
      'customer_support',
      'other'
    )
  ),
  paid_test_email_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tester_profiles_work_area_required check (
    (employment_status in ('full_time', 'part_time', 'self_employed') and work_area is not null)
    or (employment_status in ('student', 'retired', 'not_employed') and work_area is null)
  )
);

create index if not exists tester_profiles_devices_idx
  on public.tester_profiles using gin (devices);

alter table public.submissions
  add column if not exists reward_type text not null default 'credit';

alter table public.submissions
  drop constraint if exists submissions_reward_type_check;

alter table public.submissions
  add constraint submissions_reward_type_check
  check (reward_type in ('credit', 'paid'));

create index if not exists submissions_live_reward_type_idx
  on public.submissions (reward_type, created_at desc)
  where status = 'live' and is_open_for_more_tests = true;

alter table public.feedback_ratings
  add column if not exists star_rating smallint;

alter table public.feedback_ratings
  drop constraint if exists feedback_ratings_star_rating_check;

alter table public.feedback_ratings
  add constraint feedback_ratings_star_rating_check
  check (star_rating is null or star_rating between 1 and 5);

create index if not exists feedback_ratings_five_star_response_idx
  on public.feedback_ratings (test_response_id)
  where star_rating = 5;

create or replace function private.tester_paid_access_counts(p_user_id uuid)
returns table (
  completed_credit_tests bigint,
  five_star_ratings bigint,
  paid_access_unlocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with credited as (
    select distinct responses.id
    from public.test_responses responses
    join public.submissions submissions on submissions.id = responses.submission_id
    where responses.tester_user_id = p_user_id
      and responses.status = 'approved'
      and responses.credit_awarded = true
      and submissions.reward_type = 'credit'
  ), five_star as (
    select distinct credited.id
    from credited
    join public.feedback_ratings ratings on ratings.test_response_id = credited.id
    where ratings.star_rating = 5
  )
  select
    (select count(*) from credited),
    (select count(*) from five_star),
    (select count(*) from credited) >= 2 and (select count(*) from five_star) >= 2;
$$;

revoke all on function private.tester_paid_access_counts(uuid)
  from public, anon, authenticated;

create or replace function private.current_user_account_type()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.account_type
  from public.profiles profiles
  where profiles.id = (select auth.uid());
$$;

revoke all on function private.current_user_account_type() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.current_user_account_type() to anon, authenticated;

create or replace function private.current_user_has_paid_test_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select access.paid_access_unlocked
    from private.tester_paid_access_counts((select auth.uid())) access
  ), false);
$$;

revoke all on function private.current_user_has_paid_test_access() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.current_user_has_paid_test_access() to anon, authenticated;

create or replace function public.get_tester_earn_access_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
  v_counts record;
begin
  if v_user_id is null then
    raise exception 'Sign in to view tester access.';
  end if;

  select profiles.account_type
  into v_account_type
  from public.profiles profiles
  where profiles.id = v_user_id;

  if v_account_type <> 'tester' then
    return jsonb_build_object(
      'completedCreditTests', 0,
      'fiveStarRatings', 0,
      'paidAccessUnlocked', false
    );
  end if;

  select * into v_counts
  from private.tester_paid_access_counts(v_user_id);

  return jsonb_build_object(
    'completedCreditTests', v_counts.completed_credit_tests,
    'fiveStarRatings', v_counts.five_star_ratings,
    'paidAccessUnlocked', v_counts.paid_access_unlocked
  );
end;
$$;

revoke all on function public.get_tester_earn_access_summary() from public, anon;
grant execute on function public.get_tester_earn_access_summary() to authenticated;

create or replace function public.prevent_account_type_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_type is not distinct from old.account_type then
    return new;
  end if;


  if old.account_type = 'pending'
     and new.account_type in ('founder', 'tester')
     and current_setting('app.account_type_transition', true) = new.account_type then
    return new;
  end if;

  raise exception 'Account type cannot be changed.';
end;
$$;

drop trigger if exists prevent_account_type_mutation on public.profiles;
create trigger prevent_account_type_mutation
  before update of account_type on public.profiles
  for each row execute procedure public.prevent_account_type_mutation();

create or replace function public.complete_founder_signup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
begin
  if v_user_id is null then
    raise exception 'Verify your email before completing founder signup.';
  end if;

  select account_type into v_account_type
  from public.profiles
  where id = v_user_id
  for update;

  if v_account_type = 'tester' then
    raise exception 'That email already belongs to a tester account.';
  end if;

  if v_account_type = 'pending' then
    perform set_config('app.account_type_transition', 'founder', true);
    update public.profiles
    set account_type = 'founder'
    where id = v_user_id;
  end if;

  return jsonb_build_object('accountType', 'founder');
end;
$$;

revoke all on function public.complete_founder_signup() from public, anon;
grant execute on function public.complete_founder_signup() to authenticated;

create or replace function public.complete_tester_signup(
  p_first_name text,
  p_country_code text,
  p_region text,
  p_technology_proficiency text,
  p_devices text[],
  p_employment_status text,
  p_work_area text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
  v_first_name text := trim(coalesce(p_first_name, ''));
  v_country_code text := upper(trim(coalesce(p_country_code, '')));
  v_region text := nullif(trim(coalesce(p_region, '')), '');
  v_devices text[];
  v_work_area text := nullif(trim(coalesce(p_work_area, '')), '');
begin
  if v_user_id is null then
    raise exception 'Verify your email before completing tester signup.';
  end if;

  select account_type into v_account_type
  from public.profiles
  where id = v_user_id
  for update;

  if v_account_type = 'founder' then
    raise exception 'That email already has a Test4Test account. Use a different email to create a tester account.';
  end if;

  if v_account_type not in ('pending', 'tester') then
    raise exception 'Tester signup could not be completed.';
  end if;

  if length(v_first_name) not between 1 and 80 then
    raise exception 'Enter your first name.';
  end if;

  if v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Choose a country.';
  end if;

  select coalesce(
    array_agg(device order by array_position(array['computer', 'ios', 'android']::text[], device)),
    '{}'::text[]
  )
  into v_devices
  from (
    select distinct unnest(coalesce(p_devices, '{}'::text[])) as device
  ) selected
  where device = any (array['computer', 'ios', 'android']::text[]);

  if cardinality(v_devices) = 0 then
    raise exception 'Select at least one device.';
  end if;

  if p_technology_proficiency not in ('not_at_all', 'slightly', 'moderately', 'very', 'extremely') then
    raise exception 'Choose your technology proficiency.';
  end if;

  if p_employment_status not in ('full_time', 'part_time', 'self_employed', 'student', 'retired', 'not_employed') then
    raise exception 'Choose your employment status.';
  end if;

  if p_employment_status in ('full_time', 'part_time', 'self_employed') and v_work_area is null then
    raise exception 'Choose the area that best describes your work.';
  end if;

  if p_employment_status in ('student', 'retired', 'not_employed') then
    v_work_area := null;
  end if;

  insert into public.tester_profiles (
    id,
    first_name,
    country_code,
    region,
    technology_proficiency,
    devices,
    employment_status,
    work_area,
    paid_test_email_enabled
  ) values (
    v_user_id,
    v_first_name,
    v_country_code,
    v_region,
    p_technology_proficiency,
    v_devices,
    p_employment_status,
    v_work_area,
    true
  )
  on conflict (id) do update
  set first_name = excluded.first_name,
      country_code = excluded.country_code,
      region = excluded.region,
      technology_proficiency = excluded.technology_proficiency,
      devices = excluded.devices,
      employment_status = excluded.employment_status,
      work_area = excluded.work_area,
      updated_at = timezone('utc', now());

  if v_account_type = 'pending' then
    perform set_config('app.account_type_transition', 'tester', true);
    update public.profiles
    set account_type = 'tester',
        display_name = v_first_name
    where id = v_user_id;
  end if;

  return jsonb_build_object('accountType', 'tester');
end;
$$;

revoke all on function public.complete_tester_signup(text, text, text, text, text[], text, text)
  from public, anon;
grant execute on function public.complete_tester_signup(text, text, text, text, text[], text, text)
  to authenticated;

create or replace function public.update_tester_profile(
  p_first_name text,
  p_country_code text,
  p_region text,
  p_technology_proficiency text,
  p_devices text[],
  p_employment_status text,
  p_work_area text,
  p_paid_test_email_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
begin
  if v_user_id is null then
    raise exception 'Sign in to update your tester profile.';
  end if;

  select account_type into v_account_type
  from public.profiles
  where id = v_user_id;

  if v_account_type <> 'tester' then
    raise exception 'Only tester accounts can update tester profile details.';
  end if;

  perform public.complete_tester_signup(
    p_first_name,
    p_country_code,
    p_region,
    p_technology_proficiency,
    p_devices,
    p_employment_status,
    p_work_area
  );

  update public.tester_profiles
  set paid_test_email_enabled = coalesce(p_paid_test_email_enabled, true),
      updated_at = timezone('utc', now())
  where id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_tester_profile(text, text, text, text, text[], text, text, boolean)
  from public, anon;
grant execute on function public.update_tester_profile(text, text, text, text, text[], text, text, boolean)
  to authenticated;

alter table public.tester_profiles enable row level security;

drop policy if exists "tester_profiles_select_own" on public.tester_profiles;
create policy "tester_profiles_select_own"
  on public.tester_profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke all on public.tester_profiles from anon, authenticated;
grant select on public.tester_profiles to authenticated;

create or replace function public.enforce_founder_submission_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
begin
  if v_user_id is null then
    return new;
  end if;

  select account_type into v_account_type
  from public.profiles
  where id = v_user_id;

  if v_account_type = 'founder' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['response_count', 'last_response_at'])
       = (to_jsonb(old) - array['response_count', 'last_response_at']) then
    return new;
  end if;

  raise exception 'Only founder accounts can create or manage app submissions.';
end;
$$;

drop trigger if exists enforce_founder_submission_mutation on public.submissions;
create trigger enforce_founder_submission_mutation
  before insert or update on public.submissions
  for each row execute procedure public.enforce_founder_submission_mutation();
create or replace function public.enforce_founder_owned_child_mutation()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid := case when tg_op = 'DELETE' then old.submission_id else new.submission_id end;
begin
  if v_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if exists (
    select 1
    from public.submissions submissions
    join public.profiles owner_profile on owner_profile.id = submissions.user_id
    where submissions.id = v_submission_id
      and submissions.user_id = v_user_id
      and owner_profile.account_type = 'founder'
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'Only founder accounts can manage app submission content.';
end;
$$;

drop trigger if exists enforce_founder_question_set_mutation on public.question_set_versions;
create trigger enforce_founder_question_set_mutation
  before insert or update or delete on public.question_set_versions
  for each row execute procedure public.enforce_founder_owned_child_mutation();

drop trigger if exists enforce_founder_submission_version_mutation on public.submission_versions;
create trigger enforce_founder_submission_version_mutation
  before insert or update or delete on public.submission_versions
  for each row execute procedure public.enforce_founder_owned_child_mutation();

drop policy if exists "submissions_select_live_or_own" on public.submissions;
create policy "submissions_select_live_or_own"
  on public.submissions for select
  to anon, authenticated
  using (
    user_id = (select auth.uid())
    or (status = 'live' and reward_type = 'credit')
    or (
      status = 'live'
      and reward_type = 'paid'
      and private.current_user_account_type() = 'tester'
      and private.current_user_has_paid_test_access()
    )
  );

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own"
  on public.submissions for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and private.current_user_account_type() = 'founder'
  );

drop policy if exists "submissions_update_own" on public.submissions;
create policy "submissions_update_own"
  on public.submissions for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and private.current_user_account_type() = 'founder'
  )
  with check (
    (select auth.uid()) = user_id
    and private.current_user_account_type() = 'founder'
  );

grant select on public.submissions to anon, authenticated;
grant insert, update on public.submissions to authenticated;

drop policy if exists "question_sets_insert_own" on public.question_set_versions;
create policy "question_sets_insert_own"
  on public.question_set_versions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and submissions.user_id = (select auth.uid())
    )
    and private.current_user_account_type() = 'founder'
  );

drop policy if exists "question_sets_update_own" on public.question_set_versions;
create policy "question_sets_update_own"
  on public.question_set_versions for update
  to authenticated
  using (
    exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and submissions.user_id = (select auth.uid())
    )
    and private.current_user_account_type() = 'founder'
  )
  with check (
    exists (
      select 1
      from public.submissions submissions
      where submissions.id = question_set_versions.submission_id
        and submissions.user_id = (select auth.uid())
    )
    and private.current_user_account_type() = 'founder'
  );

drop policy if exists "feedback_ratings_upsert_owner" on public.feedback_ratings;
create policy "feedback_ratings_upsert_owner"
  on public.feedback_ratings for insert
  to authenticated
  with check (
    rated_by_user_id = (select auth.uid())
    and exists (
      select 1
      from public.test_responses responses
      join public.submissions submissions on submissions.id = responses.submission_id
      where responses.id = feedback_ratings.test_response_id
        and submissions.user_id = (select auth.uid())
    )
    and private.current_user_account_type() = 'founder'
  );

drop policy if exists "feedback_ratings_update_owner" on public.feedback_ratings;
create policy "feedback_ratings_update_owner"
  on public.feedback_ratings for update
  to authenticated
  using (
    rated_by_user_id = (select auth.uid())
    and private.current_user_account_type() = 'founder'
  )
  with check (
    rated_by_user_id = (select auth.uid())
    and private.current_user_account_type() = 'founder'
  );

drop function if exists public.list_earn_submissions(text[]);
create function public.list_earn_submissions(p_product_types text[])
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
  created_at timestamptz,
  reward_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_types text[];
  v_account_type text;
  v_paid_access boolean := false;
  v_needs_google_play_closed_testers boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in to browse Earn tests.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select profiles.account_type into v_account_type
  from public.profiles profiles
  where profiles.id = v_user_id;

  if v_account_type = 'tester' then
    select paid_access_unlocked into v_paid_access
    from private.tester_paid_access_counts(v_user_id);
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
    submissions.created_at,
    submissions.reward_type
  from public.submissions submissions
  where submissions.status = 'live'
    and submissions.user_id <> v_user_id
    and submissions.is_open_for_more_tests = true
    and submissions.needs_google_play_closed_testers = v_needs_google_play_closed_testers
    and public.profile_is_clear(submissions.user_id)
    and coalesce(submissions.product_types, array[submissions.product_type]) && v_product_types
    and submissions.reward_type = case
      when v_account_type = 'tester' and v_paid_access then 'paid'
      else 'credit'
    end
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

revoke all on function public.list_earn_submissions(text[]) from public, anon;
grant execute on function public.list_earn_submissions(text[]) to authenticated;

create table if not exists public.paid_test_notification_queue (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  tester_user_id uuid not null references public.tester_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (submission_id, tester_user_id)
);

create index if not exists paid_test_notification_queue_due_idx
  on public.paid_test_notification_queue (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index if not exists paid_test_notification_queue_tester_idx
  on public.paid_test_notification_queue (tester_user_id);

alter table public.paid_test_notification_queue enable row level security;
revoke all on public.paid_test_notification_queue from anon, authenticated;
grant select, insert, update on public.paid_test_notification_queue to service_role;

create or replace function private.enqueue_paid_test_for_eligible_testers(p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.paid_test_notification_queue (submission_id, tester_user_id)
  select submissions.id, tester_profiles.id
  from public.submissions submissions
  cross join public.tester_profiles tester_profiles
  join public.profiles profiles on profiles.id = tester_profiles.id
  cross join lateral private.tester_paid_access_counts(tester_profiles.id) access
  where submissions.id = p_submission_id
    and submissions.reward_type = 'paid'
    and submissions.status = 'live'
    and submissions.is_open_for_more_tests = true
    and profiles.account_type = 'tester'
    and tester_profiles.paid_test_email_enabled = true
    and access.paid_access_unlocked = true
    and coalesce(submissions.product_types, array[submissions.product_type]) &&
      array_remove(array[
        case when 'computer' = any(tester_profiles.devices) then 'website' end,
        case when 'ios' = any(tester_profiles.devices) then 'ios' end,
        case when 'android' = any(tester_profiles.devices) then 'android' end
      ], null)
  on conflict (submission_id, tester_user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function private.enqueue_existing_paid_tests_for_tester(p_tester_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.paid_test_notification_queue (submission_id, tester_user_id)
  select submissions.id, tester_profiles.id
  from public.tester_profiles tester_profiles
  join public.profiles profiles on profiles.id = tester_profiles.id
  cross join lateral private.tester_paid_access_counts(tester_profiles.id) access
  cross join public.submissions submissions
  where tester_profiles.id = p_tester_user_id
    and profiles.account_type = 'tester'
    and tester_profiles.paid_test_email_enabled = true
    and access.paid_access_unlocked = true
    and submissions.reward_type = 'paid'
    and submissions.status = 'live'
    and submissions.is_open_for_more_tests = true
    and coalesce(submissions.product_types, array[submissions.product_type]) &&
      array_remove(array[
        case when 'computer' = any(tester_profiles.devices) then 'website' end,
        case when 'ios' = any(tester_profiles.devices) then 'ios' end,
        case when 'android' = any(tester_profiles.devices) then 'android' end
      ], null)
  on conflict (submission_id, tester_user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.enqueue_paid_test_for_eligible_testers(uuid) from public, anon, authenticated;
revoke all on function private.enqueue_existing_paid_tests_for_tester(uuid) from public, anon, authenticated;

create or replace function public.sync_paid_test_notifications_for_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reward_type = 'paid'
     and new.status = 'live'
     and new.is_open_for_more_tests = true then
    perform private.enqueue_paid_test_for_eligible_testers(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_paid_test_notifications_for_submission on public.submissions;
create trigger sync_paid_test_notifications_for_submission
  after insert or update of reward_type, status, is_open_for_more_tests, product_type, product_types
  on public.submissions
  for each row execute procedure public.sync_paid_test_notifications_for_submission();

create or replace function public.sync_paid_test_notifications_for_tester()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tester_user_id uuid;
begin
  if tg_table_name = 'feedback_ratings' then
    select responses.tester_user_id
    into v_tester_user_id
    from public.test_responses responses
    where responses.id = new.test_response_id;
  else
    v_tester_user_id := new.tester_user_id;
  end if;

  if v_tester_user_id is not null then
    perform private.enqueue_existing_paid_tests_for_tester(v_tester_user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_paid_test_notifications_after_response on public.test_responses;
create trigger sync_paid_test_notifications_after_response
  after insert or update of status, credit_awarded on public.test_responses
  for each row execute procedure public.sync_paid_test_notifications_for_tester();

drop trigger if exists sync_paid_test_notifications_after_rating on public.feedback_ratings;
create trigger sync_paid_test_notifications_after_rating
  after insert or update of star_rating on public.feedback_ratings
  for each row execute procedure public.sync_paid_test_notifications_for_tester();
create or replace function public.get_paid_test_notification_delivery(p_queue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery record;
begin
  select
    queue.id,
    tester_profiles.first_name,
    profiles.email,
    profiles.account_type,
    tester_profiles.paid_test_email_enabled,
    submissions.product_name,
    submissions.reward_type,
    submissions.status,
    submissions.is_open_for_more_tests,
    access.paid_access_unlocked,
    coalesce(submissions.product_types, array[submissions.product_type]) &&
      array_remove(array[
        case when 'computer' = any(tester_profiles.devices) then 'website' end,
        case when 'ios' = any(tester_profiles.devices) then 'ios' end,
        case when 'android' = any(tester_profiles.devices) then 'android' end
      ], null) as device_matches
  into v_delivery
  from public.paid_test_notification_queue queue
  join public.tester_profiles tester_profiles on tester_profiles.id = queue.tester_user_id
  join public.profiles profiles on profiles.id = tester_profiles.id
  join public.submissions submissions on submissions.id = queue.submission_id
  cross join lateral private.tester_paid_access_counts(tester_profiles.id) access
  where queue.id = p_queue_id
    and queue.status = 'processing';

  if not found then
    return jsonb_build_object(
      'sendable', false,
      'reason', 'Notification is no longer claimable.'
    );
  end if;

  if v_delivery.account_type <> 'tester'
     or v_delivery.paid_test_email_enabled is not true
     or v_delivery.reward_type <> 'paid'
     or v_delivery.status <> 'live'
     or v_delivery.is_open_for_more_tests is not true
     or v_delivery.paid_access_unlocked is not true
     or v_delivery.device_matches is not true then
    return jsonb_build_object(
      'sendable', false,
      'reason', 'Notification no longer matches an eligible opted-in tester.'
    );
  end if;

  return jsonb_build_object(
    'sendable', true,
    'firstName', v_delivery.first_name,
    'email', v_delivery.email,
    'productName', v_delivery.product_name
  );
end;
$$;

revoke all on function public.get_paid_test_notification_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.get_paid_test_notification_delivery(uuid) to service_role;

create or replace function public.claim_paid_test_notifications(p_limit integer default 25)
returns setof public.paid_test_notification_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select queue.id
    from public.paid_test_notification_queue queue
    where (
        queue.status in ('pending', 'failed')
        or (queue.status = 'processing' and queue.claimed_at < timezone('utc', now()) - interval '15 minutes')
      )
      and queue.attempt_count < 5
      and queue.next_attempt_at <= timezone('utc', now())
    order by queue.next_attempt_at, queue.created_at
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  )
  update public.paid_test_notification_queue queue
  set status = 'processing',
      claimed_at = timezone('utc', now()),
      attempt_count = queue.attempt_count + 1,
      updated_at = timezone('utc', now())
  from due
  where queue.id = due.id
  returning queue.*;
end;
$$;

revoke all on function public.claim_paid_test_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_paid_test_notifications(integer) to service_role;

insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values (
  'paid_test_available',
  'Sent once when an eligible tester has a new device-matching paid test available.',
  'A paid test is available: {{productName}}',
  $paid_test_text$
Hi {{firstName}},

A new paid test for {{productName}} matches one of your devices.

Open Earn to view it:
{{earnUrl}}

You can turn off paid-test emails from your Profile.
$paid_test_text$,
  $paid_test_html$
<div style="font-family: Arial, sans-serif; color: #242a31; line-height: 1.6;">
  <p>Hi {{firstName}},</p>
  <p>A new paid test for <strong>{{productName}}</strong> matches one of your devices.</p>
  <p><a href="{{earnUrl}}">Open Earn to view it</a></p>
  <p>You can turn off paid-test emails from your Profile.</p>
</div>
$paid_test_html$
)
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());
