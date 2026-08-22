-- Trigger functions are invoked by their owning table triggers and are not
-- public RPC endpoints. Remove PostgreSQL's default PUBLIC execute grant.
revoke all on function public.prevent_account_type_mutation()
  from public, anon, authenticated;

revoke all on function public.enforce_founder_submission_mutation()
  from public, anon, authenticated;

revoke all on function public.enforce_founder_owned_child_mutation()
  from public, anon, authenticated;

revoke all on function public.sync_paid_test_notifications_for_submission()
  from public, anon, authenticated;

revoke all on function public.sync_paid_test_notifications_for_tester()
  from public, anon, authenticated;
