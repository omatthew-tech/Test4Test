-- Trigger functions do not need to be callable through PostgREST. Keep the
-- definer context so response submission can copy from the service-only upload
-- table, but remove direct RPC execution from application roles.
revoke all on function public.apply_test_response_recording_thumbnail()
  from public, anon, authenticated;
