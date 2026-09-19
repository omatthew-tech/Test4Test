begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

select ok(
  to_regprocedure('public.activate_earn_submission(uuid)') is not null,
  'Earn activation RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.activate_earn_submission(uuid)',
    'EXECUTE'
  ),
  'authenticated founders may activate an Earn test'
);
select ok(
  not has_function_privilege('anon', 'public.activate_earn_submission(uuid)', 'EXECUTE'),
  'anonymous users cannot activate an Earn test'
);
select ok(
  to_regclass('public.submissions_one_earn_test_per_user_idx') is not null,
  'the database enforces one active Earn test per owner'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'submissions_earn_open_requires_live'
      and conrelid = 'public.submissions'::regclass
  ),
  'only live tests can be selected for Earn'
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
values (
  '00000000-0000-0000-0000-000000000000',
  '71000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'earn-founder@test.local',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

select set_config('app.account_type_transition', 'founder', true);
update public.profiles
set account_type = 'founder'
where id = '71000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

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
  public_share_slug,
  status,
  question_mode,
  is_open_for_more_tests
)
values
  (
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'First Earn Test',
    'website',
    array['website'],
    '',
    '',
    '',
    'https://example.com/first',
    'public',
    'first-earn-test',
    'live',
    'general',
    true
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    'Second Earn Test',
    'website',
    array['website'],
    '',
    '',
    '',
    'https://example.com/second',
    'public',
    'second-earn-test',
    'live',
    'general',
    true
  );

select is(
  (
    select count(*)
    from public.submissions
    where user_id = '71000000-0000-0000-0000-000000000001'
      and is_open_for_more_tests = true
  ),
  1::bigint,
  'creating another test automatically selects only the new test for Earn'
);
select ok(
  (
    select is_open_for_more_tests
    from public.submissions
    where id = '72000000-0000-0000-0000-000000000002'
  ),
  'the newly created test is selected'
);
select is(
  (
    select count(*)
    from public.submissions
    where user_id = '71000000-0000-0000-0000-000000000001'
      and status = 'live'
  ),
  2::bigint,
  'replacing an Earn test leaves both tests live for shared links'
);

set local role authenticated;
select is(
  public.activate_earn_submission('72000000-0000-0000-0000-000000000001'),
  '72000000-0000-0000-0000-000000000001'::uuid,
  'a founder can select another owned live test'
);
reset role;

select is(
  (
    select count(*)
    from public.submissions
    where user_id = '71000000-0000-0000-0000-000000000001'
      and is_open_for_more_tests = true
  ),
  1::bigint,
  'a swap still leaves exactly one selected test'
);
select ok(
  (
    select is_open_for_more_tests
    from public.submissions
    where id = '72000000-0000-0000-0000-000000000001'
  )
  and not (
    select is_open_for_more_tests
    from public.submissions
    where id = '72000000-0000-0000-0000-000000000002'
  ),
  'the selected test replaces the previous Earn test'
);
select is(
  (
    select count(*)
    from public.submissions
    where id in (
      '72000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000002'
    )
      and status = 'live'
  ),
  2::bigint,
  'swapping does not pause either test'
);

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
  is_open_for_more_tests
)
values (
  '72000000-0000-0000-0000-000000000003',
  '71000000-0000-0000-0000-000000000001',
  'Pending Earn Test',
  'website',
  array['website'],
  '',
  '',
  '',
  'https://example.com/pending',
  'public',
  'pending_verification',
  'general',
  false
);

set local role authenticated;
select throws_ok(
  $$select public.activate_earn_submission('72000000-0000-0000-0000-000000000003')$$,
  'P0001',
  'That test is unavailable for Earn while it is paused or under review.',
  'pending tests cannot be activated'
);
select ok(
  (
    select not has_completed_test
      and rank is not null
      and would_rank = rank
      and would_ranked_submission_count = ranked_submission_count
    from public.get_my_earn_visibility_summary()
  ),
  'an account without a credited completion is ranked immediately'
);
reset role;

insert into public.question_set_versions (
  id,
  submission_id,
  version_number,
  is_active,
  mode,
  questions
)
values (
  '73000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  1,
  true,
  'general',
  '[]'
);

insert into public.test_responses (
  id,
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
)
values (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'Founder tester',
  'approved',
  90,
  true,
  300,
  '[]',
  '{}'
);

delete from public.credit_transactions
where user_id = '71000000-0000-0000-0000-000000000001';
insert into public.credit_transactions (
  user_id,
  type,
  amount,
  reason,
  related_test_response_id
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    'earned_test',
    1,
    'Credited completion',
    '74000000-0000-0000-0000-000000000001'
  ),
  (
    '71000000-0000-0000-0000-000000000001',
    'adjustment',
    -1,
    'Spent credit',
    null
  );

select is(
  (
    select sum(amount)
    from public.credit_transactions
    where user_id = '71000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'the account can spend its earned credit back to zero'
);
select ok(
  public.user_has_completed_credited_test('71000000-0000-0000-0000-000000000001'),
  'completion history remains available after spending the credit'
);

set local role authenticated;
select is(
  public.activate_earn_submission('72000000-0000-0000-0000-000000000002'),
  '72000000-0000-0000-0000-000000000002'::uuid,
  'an account with completion history can switch to a future test'
);
select ok(
  (
    select has_completed_test
      and submission_id = '72000000-0000-0000-0000-000000000002'
      and token_balance = 0
      and rank is not null
      and would_rank = rank
    from public.get_my_earn_visibility_summary()
  ),
  'the selected future test has a rank while the spent balance stays zero'
);
reset role;

select is(
  (
    select count(*)
    from public.submissions
    where user_id = '71000000-0000-0000-0000-000000000001'
      and is_open_for_more_tests = true
  ),
  1::bigint,
  'future swaps continue to enforce one selected Earn test'
);
select is(
  (
    select count(*)
    from public.submissions
    where id in (
      '72000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000002'
    )
      and status = 'live'
  ),
  2::bigint,
  'future swaps continue preserving shared-link availability'
);
select is(
  (
    select public_share_slug
    from public.submissions
    where id = '72000000-0000-0000-0000-000000000001'
  ),
  'first-earn-test',
  'the inactive test keeps its existing public share slug'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (
    select count(*)
    from public.submissions
    where public_share_slug = 'first-earn-test'
      and status = 'live'
      and is_open_for_more_tests = false
  ),
  1::bigint,
  'anonymous shared-link lookup can still load the inactive live test'
);
reset role;

select * from finish();
rollback;
