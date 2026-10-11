-- Disabled until the worker, browser tracking and sender verification are deployed.
create table private.new_user_followup_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  launched_at timestamptz
);
insert into private.new_user_followup_config(singleton) values(true);
create table private.new_user_followups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete set null,
  submitted_at timestamptz not null,
  due_at timestamptz not null,
  copy_clicked_at timestamptz,
  earned_at timestamptz,
  status text not null default 'pending' check(status in
    ('pending','claimed','sending','sent','cancelled','failed','review')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null,
  lease_id uuid,
  lease_until timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  last_error text
);
create index new_user_followups_due_idx on private.new_user_followups(next_attempt_at)
  where status = 'pending';
create index new_user_followups_lease_idx on private.new_user_followups(lease_until)
  where status in ('claimed','sending');
alter table private.new_user_followup_config enable row level security;
alter table private.new_user_followups enable row level security;
revoke all on private.new_user_followup_config, private.new_user_followups
  from public, anon, authenticated, service_role;

create function private.enqueue_new_user_followup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_time timestamptz := clock_timestamp(); v_earned timestamptz;
begin
  if not exists(select 1 from private.new_user_followup_config c
    join auth.users u on u.id = new.user_id
    where c.enabled and c.launched_at is not null and u.created_at >= c.launched_at)
    or exists(select 1 from public.submissions s where s.user_id=new.user_id and s.id<>new.id)
    then return new; end if;
  select min(created_at) into v_earned from public.credit_transactions
    where user_id=new.user_id and type='earned_test' and amount>0;
  insert into private.new_user_followups(user_id,submission_id,submitted_at,due_at,
    next_attempt_at,earned_at,status)
    values(new.user_id,new.id,v_time,v_time+interval '70 minutes',v_time+interval '70 minutes',
      v_earned,case when v_earned is null then 'pending' else 'cancelled' end)
    on conflict(user_id) do nothing;
  return new;
end; $$;
revoke all on function private.enqueue_new_user_followup() from public,anon,authenticated;
create trigger enqueue_new_user_followup after insert on public.submissions
  for each row execute function private.enqueue_new_user_followup();

create function private.cancel_earned_new_user_followup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type='earned_test' and new.amount>0 then
    update private.new_user_followups set earned_at=coalesce(earned_at,clock_timestamp()),
      status=case when status in ('pending','claimed','failed') then 'cancelled' else status end
      where user_id=new.user_id;
  end if;
  return new;
end; $$;
revoke all on function private.cancel_earned_new_user_followup() from public,anon,authenticated;
create trigger cancel_earned_new_user_followup after insert or update of type,amount on public.credit_transactions
  for each row execute function private.cancel_earned_new_user_followup();

create function private.record_share_link_copy_click(p_submission_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists(select 1 from public.submissions s
    join public.profiles p on p.id=s.user_id
    where s.id=p_submission_id and s.user_id=v_user and p.ban_status='clear') then
    raise exception 'Submission unavailable' using errcode='42501';
  end if;
  update private.new_user_followups set copy_clicked_at=coalesce(copy_clicked_at,clock_timestamp()),
    status=case when status in ('pending','claimed','failed') then 'cancelled' else status end
    where user_id=v_user;
end; $$;
revoke all on function private.record_share_link_copy_click(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.record_share_link_copy_click(uuid) to authenticated;
create function public.record_share_link_copy_click(p_submission_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select private.record_share_link_copy_click(p_submission_id);
$$;
revoke all on function public.record_share_link_copy_click(uuid) from public,anon,authenticated;
grant execute on function public.record_share_link_copy_click(uuid) to authenticated;

create function private.new_user_followup_eligible(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.new_user_followups q
    join auth.users u on u.id=q.user_id join public.profiles p on p.id=q.user_id
    cross join private.new_user_followup_config c
    where q.user_id=p_user_id and c.enabled and u.created_at>=c.launched_at
      and p.ban_status='clear' and nullif(trim(u.email),'') is not null
      and q.copy_clicked_at is null and q.earned_at is null
      and exists(select 1 from public.submissions s where s.user_id=q.user_id)
      and not exists(select 1 from public.credit_transactions t
        where t.user_id=q.user_id and t.type='earned_test' and t.amount>0));
$$;
revoke all on function private.new_user_followup_eligible(uuid) from public,anon,authenticated;

-- One service-only interface keeps queue rows inaccessible to browser roles.
create function private.new_user_followup_worker(p_action text, p_user_id uuid default null,
  p_lease_id uuid default null, p_outcome text default null, p_provider_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job private.new_user_followups; v_result jsonb; v_email text;
begin
  if p_action='inspect' then
    return jsonb_build_object('enabled',(select enabled from private.new_user_followup_config),
      'launchedAt',(select launched_at from private.new_user_followup_config),
      'due',(select count(*) from private.new_user_followups where status='pending' and next_attempt_at<=now()),
      'eligible',(select count(*) from private.new_user_followups q where status='pending'
        and next_attempt_at<=now() and private.new_user_followup_eligible(q.user_id)),
      'review',(select count(*) from private.new_user_followups where status='review'),
      'failed',(select count(*) from private.new_user_followups where status='failed'),
      'sent',(select count(*) from private.new_user_followups where status='sent'));
  elsif p_action='claim' then
    if not (select enabled from private.new_user_followup_config) then return '[]'::jsonb; end if;
    -- Never automatically repeat a provider request whose outcome is unknown.
    update private.new_user_followups set status='review',last_error='Send outcome unknown'
      where status='sending' and lease_until<=now();
    update private.new_user_followups set status=case when attempt_count>=5 then 'failed' else 'pending' end,
      lease_id=null,lease_until=null where status='claimed' and lease_until<=now();
    with candidates as (
      select user_id from private.new_user_followups where status='pending'
        and due_at<=now() and next_attempt_at<=now() and attempt_count<5
      order by next_attempt_at,user_id limit 10 for update skip locked
    ), claimed as (
      update private.new_user_followups q set status='claimed',lease_id=gen_random_uuid(),
        lease_until=now()+interval '5 minutes',attempt_count=attempt_count+1
      from candidates c where c.user_id=q.user_id returning q.user_id,q.lease_id
    ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into v_result from claimed;
    return v_result;
  end if;
  select * into v_job from private.new_user_followups
    where user_id=p_user_id and lease_id=p_lease_id for update;
  if not found then return null; end if;
  if p_action='begin' then
    if v_job.status<>'claimed' or v_job.lease_until<=now() or v_job.due_at>now() then return null; end if;
    -- A feature pause defers work; it must not permanently cancel eligible users.
    if not (select enabled from private.new_user_followup_config) then
      update private.new_user_followups set status='pending',lease_id=null,lease_until=null,
        attempt_count=greatest(attempt_count-1,0) where user_id=p_user_id;
      return null;
    end if;
    if not private.new_user_followup_eligible(p_user_id) then
      update private.new_user_followups set status='cancelled' where user_id=p_user_id;
      return null;
    end if;
    select email into v_email from auth.users where id=p_user_id;
    update private.new_user_followups set status='sending' where user_id=p_user_id;
    return jsonb_build_object('email',v_email,'submissionId',v_job.submission_id);
  elsif p_action='finish' then
    if v_job.status not in ('sending','claimed','review') then return null; end if;
    if p_outcome not in ('sent','rejected','unknown','deferred') then raise exception 'Invalid outcome'; end if;
    if p_outcome='deferred' and v_job.status<>'claimed' then return null; end if;
    update private.new_user_followups set
      status=case when p_outcome='sent' then 'sent' when p_outcome='unknown' then 'review'
        when attempt_count>=5 then 'failed' else 'pending' end,
      sent_at=case when p_outcome='sent' then clock_timestamp() else sent_at end,
      provider_message_id=coalesce(p_provider_id,provider_message_id),
      next_attempt_at=now()+interval '5 minutes'*power(2,least(attempt_count-1,4)),
      last_error=case when p_outcome='sent' then null when p_outcome='unknown' then 'Send outcome unknown'
        else 'Delivery deferred or rejected' end,
      lease_until=null where user_id=p_user_id;
    return 'true'::jsonb;
  end if;
  raise exception 'Invalid follow-up action';
end; $$;
revoke all on function private.new_user_followup_worker(text,uuid,uuid,text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.new_user_followup_worker(text,uuid,uuid,text,text) to service_role;
create function public.new_user_followup_worker(p_action text, p_user_id uuid default null,
  p_lease_id uuid default null, p_outcome text default null, p_provider_id text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.new_user_followup_worker(p_action,p_user_id,p_lease_id,p_outcome,p_provider_id);
$$;
revoke all on function public.new_user_followup_worker(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.new_user_followup_worker(text,uuid,uuid,text,text) to service_role;

insert into public.email_templates(key,description,subject_template,text_template,html_template) values (
  'new_user_inactivity_followup','One-time follow-up 70 minutes after a new user submits their app.',
  'Question about Test4Test?',
$text$Hey there,

I noticed you signed up but didn't earn any credits or share your link. Can you share why?

I'm on a mission to make user feedback accessible for everyone because everyone deserves the opportunity to build something amazing.

Just reply to this email. We appreciate any feedback!

Thanks,
Matt @ Test4Test$text$,
$html$<p>Hey there,</p>
<p>I noticed you signed up but didn't earn any credits or share your link. Can you share why?</p>
<p>I'm on a mission to make user feedback accessible for everyone because everyone deserves the opportunity to build something amazing.</p>
<p><strong>Just reply to this email</strong>. We appreciate any feedback!</p>
<p>Thanks,<br>Matt @ Test4Test</p>$html$);

-- Integrate into the existing recovery tick without changing unrelated dispatchers
-- or maintenance logic. The wrapper preserves the prior implementation verbatim.
alter function private.background_scheduler_tick(text) rename to background_scheduler_tick_without_followup;
create function private.dispatch_new_user_followups() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if not (select enabled from private.new_user_followup_config) or not exists(
    select 1 from private.new_user_followups where (status='pending' and next_attempt_at<=now())
      or (status in ('claimed','sending') and lease_until<=now())) then return null; end if;
  if not pg_try_advisory_xact_lock(61011,1) then return null; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='test_back_reminder_cron_secret' order by created_at desc limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then return null; end if;
  select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/send-new-user-followups',
    headers:=jsonb_build_object('Content-Type','application/json','x-reminder-secret',v_secret),
    body:='{}'::jsonb,timeout_milliseconds:=120000) into v_request;
  return v_request;
exception when others then
  raise warning 'Follow-up dispatch deferred to recovery';
  return null;
end; $$;
revoke all on function private.dispatch_new_user_followups() from public,anon,authenticated;
create function private.background_scheduler_tick(p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result:=private.background_scheduler_tick_without_followup(p_action);
  if p_action='recover' then
    v_result:=v_result||jsonb_build_object('newUserFollowups',private.dispatch_new_user_followups() is not null);
    update private.background_scheduler_health set result=v_result where action=p_action;
  end if;
  return v_result;
end; $$;
revoke all on function private.background_scheduler_tick(text) from public,anon,authenticated;
grant execute on function private.background_scheduler_tick(text) to service_role;
