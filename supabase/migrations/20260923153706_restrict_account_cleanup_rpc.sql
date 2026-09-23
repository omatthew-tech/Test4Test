-- These operations are called by authenticated Edge Functions or database jobs,
-- never directly by a browser. Their definer privileges require restricted access.
revoke all on function public.delete_account_data_for_user(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_cleanup_response_recordings() from public, anon, authenticated;
revoke all on function public.list_stale_test_response_recording_drafts(integer) from public, anon, authenticated;
revoke all on function public.mark_missed_google_play_closed_tests(date) from public, anon, authenticated;
revoke all on function public.upsert_test_back_reminder_sequence(uuid,uuid,uuid,uuid) from public, anon, authenticated;

grant execute on function public.delete_account_data_for_user(uuid) to service_role;
grant execute on function public.enqueue_cleanup_response_recordings() to service_role;
grant execute on function public.list_stale_test_response_recording_drafts(integer) to service_role;
grant execute on function public.mark_missed_google_play_closed_tests(date) to service_role;
grant execute on function public.upsert_test_back_reminder_sequence(uuid,uuid,uuid,uuid) to service_role;

-- Both helpers use built-ins only, so an empty search path preserves behavior.
alter function public.normalize_public_share_slug(text) set search_path = '';
alter function public.set_current_timestamp_updated_at() set search_path = '';
