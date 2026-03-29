create or replace function public.delete_account_data_for_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feedback_ratings
  where rated_by_user_id = target_user_id
     or test_response_id in (
       select responses.id
       from public.test_responses responses
       where responses.tester_user_id = target_user_id
          or responses.submission_id in (
            select submissions.id
            from public.submissions submissions
            where submissions.user_id = target_user_id
          )
     );

  delete from public.credit_transactions
  where user_id = target_user_id;

  delete from public.test_responses
  where tester_user_id = target_user_id
     or submission_id in (
       select submissions.id
       from public.submissions submissions
       where submissions.user_id = target_user_id
     );

  delete from public.question_set_versions
  where submission_id in (
    select submissions.id
    from public.submissions submissions
    where submissions.user_id = target_user_id
  );

  delete from public.submissions
  where user_id = target_user_id;

  delete from public.profiles
  where id = target_user_id;
end;
$$;

revoke all on function public.delete_account_data_for_user(uuid) from public;
grant execute on function public.delete_account_data_for_user(uuid) to service_role;