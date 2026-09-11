-- Supporting access paths; rows, privileges, ordering and query results are unchanged.
create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions(user_id, created_at desc);
create index if not exists test_responses_tester_submitted_idx
  on public.test_responses(tester_user_id, submitted_at desc);
create index if not exists submissions_owner_created_idx
  on public.submissions(user_id, created_at desc);
create index if not exists feedback_ratings_rater_idx
  on public.feedback_ratings(rated_by_user_id);

-- Cache only statement-invariant identity/access checks. Row-dependent ownership
-- predicates and their grants remain identical to the existing read policies.
alter policy responses_select_related on public.test_responses using (
  (select public.current_user_has_app_access()) and (
    tester_user_id = (select auth.uid()) or exists (
      select 1 from public.submissions submissions
      where submissions.id = test_responses.submission_id
        and submissions.user_id = (select auth.uid())
    )
  )
);
alter policy credit_transactions_select_own on public.credit_transactions using (
  user_id = (select auth.uid()) and (select public.current_user_has_app_access())
);
alter policy feedback_ratings_select_related on public.feedback_ratings using (
  (select public.current_user_has_app_access()) and (
    rated_by_user_id = (select auth.uid()) or exists (
      select 1 from public.test_responses responses
      join public.submissions submissions on submissions.id = responses.submission_id
      where responses.id = feedback_ratings.test_response_id
        and submissions.user_id = (select auth.uid())
    )
  )
);
