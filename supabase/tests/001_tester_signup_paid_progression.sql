begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_column('public', 'profiles', 'account_type', 'profiles have an account type');
select has_table('public', 'tester_profiles', 'tester profiles are stored separately');
select has_column('public', 'submissions', 'reward_type', 'submissions classify their reward');
select has_column('public', 'feedback_ratings', 'star_rating', 'ratings can store a five-star value');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tester_profiles'::regclass),
  'tester profiles have RLS enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.tester_profiles', 'SELECT'),
  'authenticated users may select tester profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.tester_profiles', 'INSERT'),
  'authenticated users cannot directly insert tester profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.tester_profiles', 'UPDATE'),
  'authenticated users cannot directly update tester profiles'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.complete_tester_signup(text,text,text,text,text[],text,text)',
    'EXECUTE'
  ),
  'authenticated users may complete tester signup atomically'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_tester_signup(text,text,text,text,text[],text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot complete tester signup'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_paid_test_notifications(integer)',
    'EXECUTE'
  ),
  'only the service worker role can claim notification jobs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_paid_test_notifications(integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim notification jobs'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'founder@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'locked@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'unlocked@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'optout@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'android@test.local', '', now(), '{}', '{}', now(), now());

select is(
  (select account_type from public.profiles where id = '20000000-0000-0000-0000-000000000001'),
  'pending',
  'new accounts begin pending'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select public.complete_tester_signup(
  '  Taylor  ',
  'us',
  '',
  'moderately',
  array['ios', 'computer', 'ios'],
  'full_time',
  'sales'
);

select is(
  (select account_type from public.profiles where id = '20000000-0000-0000-0000-000000000001'),
  'tester',
  'tester signup changes pending to tester once'
);
select ok(
  (
    select first_name = 'Taylor'
      and country_code = 'US'
      and region is null
      and devices = array['computer', 'ios']::text[]
      and work_area = 'sales'
    from public.tester_profiles
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  'tester signup normalizes country, region, and devices'
);
select throws_ok(
  $$update public.profiles
      set account_type = 'founder'
      where id = '20000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Account type cannot be changed.',
  'tester accounts cannot be converted'
);

select set_config('app.account_type_transition', 'founder', true);
update public.profiles
set account_type = 'founder'
where id = '10000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.complete_tester_signup(
      'Founder',
      'US',
      null,
      'moderately',
      array['computer'],
      'full_time',
      'software_development'
    )$$,
  'P0001',
  'That email already has a Test4Test account. Use a different email to create a tester account.',
  'founder email conflicts do not convert the account'
);

select set_config('app.account_type_transition', 'tester', true);
update public.profiles
set account_type = 'tester'
where id in (
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);

insert into public.tester_profiles (
  id,
  first_name,
  country_code,
  technology_proficiency,
  devices,
  employment_status,
  work_area,
  paid_test_email_enabled
)
values
  ('20000000-0000-0000-0000-000000000002', 'Unlocked', 'US', 'very', array['computer'], 'student', null, true),
  ('20000000-0000-0000-0000-000000000003', 'Optout', 'US', 'slightly', array['computer'], 'retired', null, false),
  ('20000000-0000-0000-0000-000000000004', 'Android', 'US', 'extremely', array['android'], 'self_employed', 'other', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.tester_profiles),
  1::bigint,
  'tester profile RLS reveals only the signed-in tester'
);
select throws_ok(
  $$update public.tester_profiles
      set first_name = 'Bypass'
      where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table tester_profiles',
  'tester profile writes must use the secured RPC'
);
select throws_ok(
  $$insert into public.submissions (
      id,
      user_id,
      product_name,
      product_type,
      product_types,
      access_url,
      access_method,
      question_mode
    ) values (
      '30000000-0000-0000-0000-000000000099',
      '20000000-0000-0000-0000-000000000001',
      'Tester-owned app',
      'website',
      array['website'],
      'https://example.com/not-allowed',
      'public',
      'general'
    )$$,
  'P0001',
  'Only founder accounts can create or manage app submissions.',
  'tester accounts cannot create app submissions'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

insert into public.submissions (
  id,
  user_id,
  product_name,
  product_type,
  product_types,
  description,
  target_audience,
  instructions,
  access_url,
  access_method,
  status,
  question_mode,
  is_open_for_more_tests,
  reward_type
)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Credit One', 'website', array['website'], '', '', '', 'https://example.com/one', 'public', 'live', 'general', true, 'credit'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Credit Two', 'website', array['website'], '', '', '', 'https://example.com/two', 'public', 'live', 'general', true, 'credit'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Credit Available', 'website', array['website'], '', '', '', 'https://example.com/three', 'public', 'live', 'general', true, 'credit');

insert into public.submission_versions (id, submission_id, version_number, title, is_active)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 'Version 1', true),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 1, 'Version 1', true),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 1, 'Version 1', true);

insert into public.question_set_versions (
  id,
  submission_id,
  version_number,
  is_active,
  mode,
  questions
)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, true, 'general', '[]'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 1, true, 'general', '[]'),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 1, true, 'general', '[]');

insert into public.test_responses (
  id,
  submission_id,
  tester_user_id,
  question_set_version_id,
  submission_version_id,
  anonymous_label,
  status,
  quality_score,
  credit_awarded,
  duration_seconds,
  answers
)
values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Tester A', 'approved', 100, true, 120, '[]'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Tester A', 'approved', 100, true, 120, '[]'),
  ('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Tester B', 'approved', 100, true, 120, '[]'),
  ('60000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Tester B', 'approved', 100, true, 120, '[]'),
  ('60000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Tester C', 'approved', 100, true, 120, '[]'),
  ('60000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Tester C', 'approved', 100, true, 120, '[]');

insert into public.feedback_ratings (
  test_response_id,
  rated_by_user_id,
  rating_value,
  star_rating
)
select
  response_id,
  '10000000-0000-0000-0000-000000000001',
  'smiley',
  5
from unnest(array[
  '60000000-0000-0000-0000-000000000001'::uuid,
  '60000000-0000-0000-0000-000000000002'::uuid,
  '60000000-0000-0000-0000-000000000003'::uuid,
  '60000000-0000-0000-0000-000000000004'::uuid,
  '60000000-0000-0000-0000-000000000005'::uuid,
  '60000000-0000-0000-0000-000000000006'::uuid
]) response_id;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select ok(
  (select
    (summary ->> 'completedCreditTests')::integer = 2
    and (summary ->> 'fiveStarRatings')::integer = 2
    and (summary ->> 'paidAccessUnlocked')::boolean
   from (select public.get_tester_earn_access_summary() summary) access),
  'eligibility counts distinct credited tests and their five-star ratings'
);
select set_config('request.jwt.claim.sub', '', true);

insert into public.submissions (
  id,
  user_id,
  product_name,
  product_type,
  product_types,
  description,
  target_audience,
  instructions,
  access_url,
  access_method,
  status,
  question_mode,
  is_open_for_more_tests,
  reward_type
)
values (
  '30000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Paid Website Test',
  'website',
  array['website'],
  '',
  '',
  '',
  'https://example.com/paid',
  'public',
  'live',
  'general',
  true,
  'paid'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.submissions where reward_type = 'paid'),
  0::bigint,
  'locked testers cannot read paid rows directly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.submissions where reward_type = 'paid'),
  1::bigint,
  'eligible testers may read paid rows'
);
select ok(
  not exists (
    select 1
    from public.list_earn_submissions(array['website'])
    where reward_type <> 'paid'
  )
  and (select count(*) from public.list_earn_submissions(array['website'])) = 1,
  'unlocked tester Earn returns paid tests only'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select ok(
  not exists (
    select 1
    from public.list_earn_submissions(array['website'])
    where reward_type <> 'credit'
  ),
  'locked tester Earn returns credit tests only'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*) from public.submissions where reward_type = 'paid'),
  0::bigint,
  'anonymous Data API access cannot read paid rows'
);
reset role;

select is(
  (
    select count(*)
    from public.paid_test_notification_queue
    where tester_user_id = '20000000-0000-0000-0000-000000000002'
      and submission_id = '30000000-0000-0000-0000-000000000004'
  ),
  1::bigint,
  'an eligible device-matching tester is queued once'
);
select is(
  (
    select count(*)
    from public.paid_test_notification_queue
    where tester_user_id = '20000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'paid-test email opt-out suppresses queueing'
);
select is(
  (
    select count(*)
    from public.paid_test_notification_queue
    where tester_user_id = '20000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'device mismatch suppresses queueing'
);
select throws_ok(
  $$insert into public.paid_test_notification_queue (submission_id, tester_user_id)
    values (
      '30000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000002'
    )$$,
  '23505',
  null,
  'notification queue deduplicates each paid-test and tester pair'
);
select is(
  (select count(*) from public.claim_paid_test_notifications(25)),
  1::bigint,
  'service worker claims one due paid-test notification'
);
select ok(
  (
    select (public.get_paid_test_notification_delivery(id) ->> 'sendable')::boolean
    from public.paid_test_notification_queue
    where tester_user_id = '20000000-0000-0000-0000-000000000002'
      and submission_id = '30000000-0000-0000-0000-000000000004'
  ),
  'delivery is allowed only while tester eligibility and matching remain valid'
);

update public.tester_profiles
set paid_test_email_enabled = false
where id = '20000000-0000-0000-0000-000000000002';

select ok(
  not (
    select (public.get_paid_test_notification_delivery(id) ->> 'sendable')::boolean
    from public.paid_test_notification_queue
    where tester_user_id = '20000000-0000-0000-0000-000000000002'
      and submission_id = '30000000-0000-0000-0000-000000000004'
  ),
  'delivery rechecks tester opt-out before sending'
);

select * from finish();
rollback;
