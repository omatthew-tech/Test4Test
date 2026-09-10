-- Public, read-only aggregate for the homepage. Independent of viewer-specific
-- submission RLS: every visitor sees the same total, including paid/link-only tests.
-- The definer privilege exposes only this scalar, with no arguments or row data.
create or replace function public.get_home_submitted_test_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.submissions submissions
  join public.profiles profiles on profiles.id = submissions.user_id
  where submissions.status = 'live'
    and profiles.ban_status = 'clear';
$$;

revoke all on function public.get_home_submitted_test_count()
  from public, anon, authenticated;
grant execute on function public.get_home_submitted_test_count()
  to anon, authenticated;

comment on function public.get_home_submitted_test_count() is
  'Homepage count of currently published tests from non-banned owners, regardless of reward type or whether they accept more responses. Returns no individual submission or user data.';
