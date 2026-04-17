update public.test_back_reminder_sequences
set next_send_at = coalesce(next_send_at, resolved_at, updated_at, created_at, timezone('utc', now()));

create or replace function public.upsert_test_back_reminder_sequence(
  p_owner_user_id uuid,
  p_tester_user_id uuid,
  p_response_id uuid,
  p_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence_id uuid;
begin
  insert into public.test_back_reminder_sequences (
    owner_user_id,
    tester_user_id,
    latest_triggering_response_id,
    latest_triggering_submission_id,
    emails_sent,
    next_send_at,
    status,
    resolved_reason,
    last_sent_at,
    resolved_at
  ) values (
    p_owner_user_id,
    p_tester_user_id,
    p_response_id,
    p_submission_id,
    0,
    timezone('utc', now()),
    'pending',
    null,
    null,
    null
  )
  on conflict (owner_user_id, tester_user_id) do update
  set latest_triggering_response_id = excluded.latest_triggering_response_id,
      latest_triggering_submission_id = excluded.latest_triggering_submission_id,
      status = case
        when test_back_reminder_sequences.status = 'pending'
          then test_back_reminder_sequences.status
        else 'pending'
      end,
      resolved_reason = case
        when test_back_reminder_sequences.status = 'pending'
          then test_back_reminder_sequences.resolved_reason
        else null
      end,
      resolved_at = case
        when test_back_reminder_sequences.status = 'pending'
          then test_back_reminder_sequences.resolved_at
        else null
      end,
      emails_sent = case
        when test_back_reminder_sequences.status = 'pending'
          then test_back_reminder_sequences.emails_sent
        else 0
      end,
      next_send_at = case
        when test_back_reminder_sequences.status = 'pending'
          then coalesce(test_back_reminder_sequences.next_send_at, timezone('utc', now()))
        else timezone('utc', now())
      end,
      last_sent_at = case
        when test_back_reminder_sequences.status = 'pending'
          then test_back_reminder_sequences.last_sent_at
        else null
      end,
      updated_at = timezone('utc', now())
  returning id into v_sequence_id;

  return v_sequence_id;
end;
$$;

create or replace function public.sync_test_back_reminder_sequences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_owner_user_id uuid;
begin
  select submissions.user_id
  into v_submission_owner_user_id
  from public.submissions submissions
  where submissions.id = new.submission_id;

  if not found then
    return new;
  end if;

  if new.status = 'approved' and coalesce(new.credit_awarded, false) then
    update public.test_back_reminder_sequences
    set status = 'resolved',
        resolved_reason = 'tested_back',
        resolved_at = timezone('utc', now()),
        next_send_at = coalesce(test_back_reminder_sequences.next_send_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where owner_user_id = new.tester_user_id
      and tester_user_id = v_submission_owner_user_id
      and status = 'pending';

    if v_submission_owner_user_id <> new.tester_user_id
       and public.profile_is_clear(v_submission_owner_user_id)
       and public.profile_is_clear(new.tester_user_id)
       and not public.has_tested_back(v_submission_owner_user_id, new.tester_user_id)
       and exists (
         select 1
         from public.find_test_back_target_submission(new.tester_user_id, v_submission_owner_user_id)
       ) then
      perform public.upsert_test_back_reminder_sequence(
        v_submission_owner_user_id,
        new.tester_user_id,
        new.id,
        new.submission_id
      );
    end if;
  end if;

  return new;
end;
$$;

