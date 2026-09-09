begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  to_regprocedure('public.list_home_trusted_submissions()') is not null,
  'the public homepage feed RPC exists'
);
select ok(
  not exists (
    select 1
    from pg_proc functions
    join pg_namespace namespaces
      on namespaces.oid = functions.pronamespace
    cross join lateral aclexplode(
      coalesce(functions.proacl, acldefault('f', functions.proowner))
    ) function_acl
    where namespaces.nspname = 'public'
      and functions.proname = 'list_home_trusted_submissions'
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC does not retain the default function execution grant'
);
select ok(
  has_function_privilege('anon', 'public.list_home_trusted_submissions()', 'EXECUTE'),
  'anonymous visitors may load the homepage feed'
);
select ok(
  has_function_privilege('authenticated', 'public.list_home_trusted_submissions()', 'EXECUTE'),
  'authenticated visitors may load the homepage feed'
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
select
  '00000000-0000-0000-0000-000000000000',
  ('81000000-0000-0000-0000-' || lpad(owner_index::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'home-trusted-' || owner_index || '@test.local',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
from generate_series(1, 13) owner_index;

update public.profiles
set ban_status = 'banned',
    banned_at = now()
where id = '81000000-0000-0000-0000-000000000012';

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
  reward_type,
  needs_google_play_closed_testers,
  promoted,
  response_count,
  created_at
)
select
  ('82000000-0000-0000-0000-' || lpad(owner_index::text, 12, '0'))::uuid,
  ('81000000-0000-0000-0000-' || lpad(owner_index::text, 12, '0'))::uuid,
  product_name,
  'website',
  array['website'],
  product_name || ' description',
  '',
  '',
  'https://example.com/' || owner_index,
  'public',
  submission_status,
  'general',
  is_selected,
  reward_type,
  is_closed_test,
  is_promoted,
  response_count,
  created_at
from (
  values
    (1, 'Promoted first', 'live', true, 'credit', false, true, 12, '2026-08-01T12:00:00Z'::timestamptz),
    (2, 'Credit rank 1', 'live', true, 'credit', false, false, 5, '2026-08-02T12:00:00Z'::timestamptz),
    (3, 'Credit rank 2', 'live', true, 'credit', false, false, 4, '2026-08-03T12:00:00Z'::timestamptz),
    (4, 'Credit rank 3', 'live', true, 'credit', false, false, 3, '2026-08-04T12:00:00Z'::timestamptz),
    (5, 'Credit rank 4', 'live', true, 'credit', false, false, 2, '2026-08-05T12:00:00Z'::timestamptz),
    (6, 'Credit rank 5', 'live', true, 'credit', false, false, 1, '2026-08-06T12:00:00Z'::timestamptz),
    (7, 'Below limit 1', 'live', true, 'credit', false, false, 0, '2026-08-07T12:00:00Z'::timestamptz),
    (8, 'Below limit 2', 'live', true, 'credit', false, false, 0, '2026-08-08T12:00:00Z'::timestamptz),
    (9, 'Excluded paid', 'live', true, 'paid', false, true, 0, '2026-08-09T12:00:00Z'::timestamptz),
    (10, 'Excluded closed pool', 'live', true, 'credit', true, true, 0, '2026-08-10T12:00:00Z'::timestamptz),
    (11, 'Excluded paused', 'paused', false, 'credit', false, true, 0, '2026-08-11T12:00:00Z'::timestamptz),
    (12, 'Excluded banned owner', 'live', true, 'credit', false, true, 0, '2026-08-12T12:00:00Z'::timestamptz),
    (13, 'Excluded unselected', 'live', false, 'credit', false, true, 0, '2026-08-13T12:00:00Z'::timestamptz)
) as fixtures(
  owner_index,
  product_name,
  submission_status,
  is_selected,
  reward_type,
  is_closed_test,
  is_promoted,
  response_count,
  created_at
);

insert into public.credit_transactions (user_id, type, amount, reason)
select
  ('81000000-0000-0000-0000-' || lpad(owner_index::text, 12, '0'))::uuid,
  'adjustment',
  (9 - owner_index) * 10,
  'Homepage ranking fixture'
from generate_series(2, 8) owner_index;

set local role anon;

select is(
  (select count(*) from public.list_home_trusted_submissions()),
  6::bigint,
  'the public feed is capped at six tests'
);
select is(
  (
    select array_agg(product_name)
    from public.list_home_trusted_submissions()
  ),
  array[
    'Promoted first',
    'Credit rank 1',
    'Credit rank 2',
    'Credit rank 3',
    'Credit rank 4',
    'Credit rank 5'
  ]::text[],
  'the public feed mirrors Earn priority and excludes ineligible tests'
);
select is(
  (
    select array_agg(keys.key order by keys.key)
    from public.list_home_trusted_submissions() submissions
    cross join lateral jsonb_object_keys(to_jsonb(submissions)) keys(key)
    where submissions.product_name = 'Promoted first'
  ),
  array['description', 'id', 'product_name', 'product_types']::text[],
  'the public feed exposes only the card fields'
);
select ok(
  not exists (
    select 1
    from public.list_home_trusted_submissions()
    where product_name like 'Excluded %'
  ),
  'paid, closed-pool, paused, banned-owner, and unselected tests stay private'
);

reset role;
select * from finish();
rollback;
