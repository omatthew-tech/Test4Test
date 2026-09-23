-- Existing feedback is permanently free. New submissions are stamped by the submission RPC.
alter table public.test_responses add column feedback_source text not null default 'legacy'
  check (feedback_source in ('legacy', 'earn', 'shared_link'));
alter table public.test_responses alter column feedback_source set default 'shared_link';

create function private.stamp_feedback_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.feedback_source is distinct from old.feedback_source then
      raise exception 'Feedback source cannot be changed.' using errcode = '22023';
    end if;
  else
    new.feedback_source := case when current_setting('test4test.feedback_source', true) = 'earn'
      then 'earn' else 'shared_link' end;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_feedback_source() from public, anon, authenticated;
create trigger stamp_feedback_source before insert or update of feedback_source
  on public.test_responses for each row execute function private.stamp_feedback_source();

alter table public.credit_transactions drop constraint credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type in ('starter_credit', 'earned_test', 'adjustment', 'revocation', 'feedback_unlock'));
alter table public.credit_transactions add constraint feedback_unlock_amount_check
  check (type <> 'feedback_unlock' or amount = -1);
create unique index credit_transactions_feedback_unlock_unique
  on public.credit_transactions(user_id, related_test_response_id) where type = 'feedback_unlock';

-- Every ledger writer takes the same account lock, including moderation adjustments.
-- The unlock RPC acquires this lock BEFORE reading the balance.
create function private.serialize_credit_transaction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Credit transactions cannot move between accounts.' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = case when tg_op = 'DELETE' then old.user_id else new.user_id end for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.serialize_credit_transaction() from public, anon, authenticated;
create trigger serialize_credit_transaction before insert or update or delete
  on public.credit_transactions for each row execute function private.serialize_credit_transaction();

create function private.feedback_access(p_source text, p_response uuid, p_owner uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select case when p_source <> 'earn' then 'free'
    when exists(select 1 from public.credit_transactions c
      where c.user_id = p_owner and c.related_test_response_id = p_response and c.type = 'feedback_unlock')
    then 'unlocked' else 'locked' end;
$$;
revoke all on function private.feedback_access(text,uuid,uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.feedback_access(text,uuid,uuid) to authenticated, service_role;

create function private.submit_test_response_from_source(
  p_submission_id uuid, p_answers jsonb, p_duration_seconds integer,
  p_recording_bucket text, p_recording_path text, p_question_set_version_id uuid,
  p_submission_version_id uuid, p_visit_id uuid, p_feedback_source text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_previous text := current_setting('test4test.feedback_source', true);
begin
  if auth.uid() is null or not public.current_user_has_app_access() then
    raise exception 'Sign in before completing tests.' using errcode = '42501';
  end if;
  if p_feedback_source is null or p_feedback_source not in ('earn', 'shared_link') then
    raise exception 'Invalid feedback source.' using errcode = '22023';
  end if;
  perform set_config('test4test.feedback_source', p_feedback_source, true);
  v_result := public.submit_test_response_with_attribution(p_submission_id, p_answers,
    p_duration_seconds, p_recording_bucket, p_recording_path, p_question_set_version_id,
    p_submission_version_id, p_visit_id);
  perform set_config('test4test.feedback_source', coalesce(v_previous, ''), true);
  return v_result;
end;
$$;
create function public.submit_test_response_from_source(
  p_submission_id uuid, p_answers jsonb, p_duration_seconds integer,
  p_recording_bucket text default null, p_recording_path text default null,
  p_question_set_version_id uuid default null, p_submission_version_id uuid default null,
  p_visit_id uuid default null, p_feedback_source text default 'shared_link'
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_test_response_from_source(p_submission_id,p_answers,p_duration_seconds,
    p_recording_bucket,p_recording_path,p_question_set_version_id,p_submission_version_id,p_visit_id,p_feedback_source);
$$;
revoke all on function private.submit_test_response_from_source(uuid,jsonb,integer,text,text,uuid,uuid,uuid,text),
  public.submit_test_response_from_source(uuid,jsonb,integer,text,text,uuid,uuid,uuid,text) from public, anon;
grant execute on function private.submit_test_response_from_source(uuid,jsonb,integer,text,text,uuid,uuid,uuid,text),
  public.submit_test_response_from_source(uuid,jsonb,integer,text,text,uuid,uuid,uuid,text) to authenticated;

-- Same eligibility and ordering as findTargetSubmission in test-back-reminders.ts.
create function private.feedback_test_back_target(p_tester uuid, p_owner uuid)
returns uuid language sql stable security invoker set search_path = '' as $$
  select s.id from public.submissions s
  where s.user_id = p_tester and s.status = 'live' and s.is_open_for_more_tests
    and not exists(select 1 from public.profiles p where p.id = p_tester and p.ban_status = 'banned')
    and exists(select 1 from public.submissions p where p.user_id = p_tester and p.status = 'live' and p.needs_google_play_closed_testers)
      = exists(select 1 from public.submissions p where p.user_id = p_owner and p.status = 'live' and p.needs_google_play_closed_testers)
    and s.needs_google_play_closed_testers = exists(select 1 from public.submissions p
      where p.user_id = p_owner and p.status = 'live' and p.needs_google_play_closed_testers)
    and not exists(select 1 from public.test_responses r where r.submission_id = s.id
      and r.tester_user_id = p_owner and r.status = 'approved' and r.credit_awarded)
  order by s.promoted desc, s.response_count, s.created_at desc, s.id limit 1;
$$;
revoke all on function private.feedback_test_back_target(uuid,uuid) from public, anon, authenticated;

create function private.open_received_feedback(p_response_id uuid, p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid(); v_response public.test_responses%rowtype;
  v_balance bigint; v_access text; v_recording jsonb; v_transaction public.credit_transactions%rowtype;
begin
  if v_owner is null or not public.current_user_has_app_access() then
    raise exception 'Sign in to view feedback.' using errcode = '42501';
  end if;
  -- Consistent account-first order prevents two recordings spending the same last credit.
  perform 1 from public.profiles where id = v_owner for update;
  select r.* into v_response from public.test_responses r join public.submissions s on s.id = r.submission_id
    where r.id = p_response_id and s.user_id = v_owner for share of r;
  if not found then
    if exists(select 1 from public.test_responses where id = p_response_id) then
      raise exception 'You do not have permission to view this feedback.' using errcode = '42501';
    end if;
    return jsonb_build_object('status','unavailable');
  end if;
  v_recording := to_jsonb(v_response);
  if p_version_id is not null then
    if to_regclass('public.test_response_versions') is null then
      return jsonb_build_object('status','unavailable');
    end if;
    execute 'select to_jsonb(v) from public.test_response_versions v where v.id = $1 and v.response_id = $2 for share'
      into v_recording using p_version_id, p_response_id;
  end if;
  if v_recording is null or v_recording->>'recording_deleted_at' is not null
    or v_recording->>'recording_bucket' is null or v_recording->>'recording_path' is null then
    -- Historical written feedback is already free and must remain readable.
    if not (v_response.feedback_source <> 'earn' and p_version_id is not null
      and v_recording is not null and v_recording->>'recording_deleted_at' is null) then
      return jsonb_build_object('status','unavailable');
    end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.credit_transactions where user_id = v_owner;
  v_access := private.feedback_access(v_response.feedback_source, p_response_id, v_owner);
  if v_access = 'locked' then
    if v_balance < 1 then
      return jsonb_build_object('status','insufficient_credits','balance',v_balance,
        'testBackSubmissionId',private.feedback_test_back_target(v_response.tester_user_id,v_owner));
    end if;
    insert into public.credit_transactions(user_id,type,amount,reason,related_test_response_id)
      values(v_owner,'feedback_unlock',-1,'Opened received feedback',p_response_id) returning * into v_transaction;
    v_balance := v_balance - 1;
    v_access := 'unlocked';
  end if;
  return jsonb_build_object('status',v_access,'balance',v_balance,'transaction',to_jsonb(v_transaction),
    'response',to_jsonb(v_response));
end;
$$;
create function public.open_received_feedback(p_response_id uuid, p_version_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.open_received_feedback(p_response_id,p_version_id);
$$;
revoke all on function private.open_received_feedback(uuid,uuid), public.open_received_feedback(uuid,uuid) from public, anon;
grant execute on function private.open_received_feedback(uuid,uuid), public.open_received_feedback(uuid,uuid) to authenticated;

-- Full response rows contain written answers and private media metadata. Owners read locked
-- items through the deliberately redacted summary operation instead of bypassing these policies.
alter policy responses_select_related on public.test_responses using (
  (select public.current_user_has_app_access()) and (
    tester_user_id = (select auth.uid()) or (
      exists(select 1 from public.submissions s where s.id = submission_id and s.user_id = (select auth.uid()))
      and private.feedback_access(feedback_source,id,(select auth.uid())) <> 'locked'
    )
  )
);

create function private.list_received_feedback()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or not public.current_user_has_app_access() then
    raise exception 'Sign in to view feedback.' using errcode = '42501';
  end if;
  return query select
    case when a.access <> 'locked' then to_jsonb(r)
    else jsonb_build_object('id',r.id,'submission_id',r.submission_id,'submission_version_id',r.submission_version_id,
      'question_set_version_id',r.question_set_version_id,'tester_user_id',r.tester_user_id,
      'anonymous_label',r.anonymous_label,'status',r.status,'quality_score',0,'credit_awarded',r.credit_awarded,
      'submitted_at',r.submitted_at,'duration_seconds',r.duration_seconds,'answers','[]'::jsonb,'internal_flags','[]'::jsonb)
    end || jsonb_build_object('feedback_source',r.feedback_source,'feedback_access',a.access,
      'has_recording',r.recording_bucket is not null and r.recording_path is not null and r.recording_deleted_at is null)
    from public.test_responses r join public.submissions s on s.id = r.submission_id
    cross join lateral (select private.feedback_access(r.feedback_source,r.id,v_owner) as access) a
    where s.user_id = v_owner order by r.submitted_at desc,r.id;
end;
$$;
create function public.list_received_feedback() returns setof jsonb
language sql stable security invoker set search_path = '' as $$ select * from private.list_received_feedback(); $$;
revoke all on function private.list_received_feedback(), public.list_received_feedback() from public, anon;
grant execute on function private.list_received_feedback(), public.list_received_feedback() to authenticated;

-- Service-only batch operation for the authenticated Edge Functions. Never accepts an owner
-- identity from an unauthenticated client.
create function public.get_received_feedback_access(p_owner uuid, p_response_ids uuid[])
returns table(response_id uuid, access text) language sql stable security invoker set search_path = '' as $$
  select r.id, private.feedback_access(r.feedback_source,r.id,p_owner)
  from public.test_responses r join public.submissions s on s.id = r.submission_id
  where s.user_id = p_owner and r.id = any(p_response_ids);
$$;
revoke all on function public.get_received_feedback_access(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.get_received_feedback_access(uuid,uuid[]) to service_role;

-- Version/transcript policies join test_responses, so its stricter RLS propagates automatically.
-- Report RPCs run as service_role and need an explicit filter. Support both deployed report schemas.
do $$
declare v_function record; v_definition text; v_updated text; v_response_alias text;
begin
  for v_function in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_transcript_report_page','get_transcript_report_page_delta')
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('where s.user_id = p_owner' in v_definition) = 0 then continue; end if;
    v_response_alias := case when position('test_responses response' in v_definition) > 0 then 'response' else 'r' end;
    v_updated := replace(v_definition,'where s.user_id = p_owner',
      'where private.feedback_access(' || v_response_alias || '.feedback_source,' || v_response_alias || '.id,p_owner) <> ''locked'' and s.user_id = p_owner');
    execute v_updated;
  end loop;
end;
$$;
