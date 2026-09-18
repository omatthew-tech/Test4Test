-- Let a founder explicitly remove their optional rating without granting access
-- to another founder's ratings or ratings on apps they do not own.
grant delete on public.feedback_ratings to authenticated;

create policy "feedback_ratings_delete_owner"
  on public.feedback_ratings for delete
  to authenticated
  using (
    rated_by_user_id = (select auth.uid())
    and (select public.current_user_has_app_access())
    and (select private.current_user_account_type()) = 'founder'
    and exists (
      select 1
      from public.test_responses responses
      join public.submissions submissions on submissions.id = responses.submission_id
      where responses.id = feedback_ratings.test_response_id
        and submissions.user_id = (select auth.uid())
    )
  );
