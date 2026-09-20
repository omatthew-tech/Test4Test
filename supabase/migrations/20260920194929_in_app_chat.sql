-- Chat writes are atomic RPCs. Browser table grants are SELECT-only for Realtime.
create schema if not exists private;

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  founder_user_id uuid not null references public.profiles(id) on delete cascade,
  tester_user_id uuid not null references public.profiles(id) on delete cascade,
  last_message_sequence bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (submission_id, tester_user_id),
  check (founder_user_id <> tester_user_id)
);
create index chat_conversations_founder on public.chat_conversations(founder_user_id, last_message_sequence desc);
create index chat_conversations_tester on public.chat_conversations(tester_user_id, last_message_sequence desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  unique (sender_user_id, client_request_id)
);
create index chat_messages_history on public.chat_messages(conversation_id, sequence desc);
create index chat_messages_rate_limit on public.chat_messages(sender_user_id, created_at desc);

create table public.chat_read_states (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_sequence bigint not null default 0,
  unread_since timestamptz,
  unread_epoch uuid,
  primary key (conversation_id, user_id),
  check ((unread_since is null) = (unread_epoch is null))
);
create index chat_read_states_user on public.chat_read_states(user_id, conversation_id);

create table public.chat_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete cascade,
  unread_epoch uuid,
  stage smallint not null check (stage in (0, 3, 7)),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check ((stage = 0 and message_id is not null and unread_epoch is null)
    or (stage <> 0 and message_id is null and unread_epoch is not null))
);
create unique index chat_notification_initial on public.chat_notification_outbox(message_id) where stage = 0;
create unique index chat_notification_reminder on public.chat_notification_outbox(conversation_id, recipient_user_id, unread_epoch, stage) where stage <> 0;
create index chat_notification_due on public.chat_notification_outbox(next_attempt_at) where status in ('pending', 'failed', 'processing');
create index chat_notification_recipient on public.chat_notification_outbox(recipient_user_id);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_read_states enable row level security;
alter table public.chat_notification_outbox enable row level security;
revoke all on public.chat_conversations, public.chat_messages, public.chat_read_states, public.chat_notification_outbox from anon, authenticated;
grant select on public.chat_conversations, public.chat_messages, public.chat_read_states to authenticated;
grant all on public.chat_conversations, public.chat_messages, public.chat_read_states, public.chat_notification_outbox to service_role;
grant usage on sequence public.chat_messages_sequence_seq to service_role;
grant usage on schema private to authenticated, service_role;

create function private.chat_actor() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.profiles where id = v_actor and ban_status = 'clear') then
    raise exception 'Sign in with an available account to use Messages.' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
create function private.chat_is_member(p_conversation uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.chat_conversations c join public.profiles p on p.id = auth.uid()
    where c.id = p_conversation and auth.uid() in (c.founder_user_id, c.tester_user_id) and p.ban_status = 'clear'
  );
$$;
create policy chat_conversations_read on public.chat_conversations for select to authenticated using (private.chat_is_member(id));
create policy chat_messages_read on public.chat_messages for select to authenticated using (private.chat_is_member(conversation_id));
create policy chat_read_states_read on public.chat_read_states for select to authenticated using (user_id = (select auth.uid()) and private.chat_is_member(conversation_id));

create function private.chat_summary(p_conversation uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'submissionId', c.submission_id, 'productName', s.product_name,
    'peerName', p.display_name, 'canSend', p.ban_status = 'clear',
    'lastSequence', c.last_message_sequence, 'lastMessage', m.body, 'lastMessageAt', m.created_at,
    'unreadCount', (select count(*) from public.chat_messages u where u.conversation_id = c.id
      and u.sender_user_id <> auth.uid() and u.sequence > coalesce(r.last_read_sequence, 0)))
  from public.chat_conversations c join public.submissions s on s.id = c.submission_id
  join public.profiles p on p.id = case when auth.uid() = c.founder_user_id then c.tester_user_id else c.founder_user_id end
  left join public.chat_messages m on m.sequence = c.last_message_sequence
  left join public.chat_read_states r on r.conversation_id = c.id and r.user_id = auth.uid()
  where c.id = p_conversation and private.chat_is_member(c.id);
$$;

create function private.chat_context(p_response_id uuid, p_conversation_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_result jsonb; v_response record;
begin
  if p_conversation_id is not null then
    v_result := private.chat_summary(p_conversation_id);
  else
    select r.submission_id, r.tester_user_id, s.product_name, p.display_name, p.ban_status into v_response
    from public.test_responses r join public.submissions s on s.id = r.submission_id
    join public.profiles p on p.id = r.tester_user_id
    where r.id = p_response_id and s.user_id = v_actor and r.tester_user_id <> v_actor;
    if found then
      select private.chat_summary(c.id) into v_result from public.chat_conversations c
        where c.submission_id = v_response.submission_id and c.tester_user_id = v_response.tester_user_id;
      v_result := coalesce(v_result, jsonb_build_object('id', null, 'submissionId', v_response.submission_id,
        'productName', v_response.product_name, 'peerName', v_response.display_name,
        'canSend', v_response.ban_status = 'clear', 'lastSequence', 0, 'lastMessage', null, 'lastMessageAt', null, 'unreadCount', 0));
    end if;
  end if;
  if v_result is null then raise exception 'This conversation is unavailable.' using errcode = '42501'; end if;
  return v_result;
end;
$$;

create function private.chat_list(p_before bigint) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_items jsonb; v_more bigint; v_unread bigint;
begin
  select coalesce(jsonb_agg(item order by seq desc), '[]') into v_items from (
    select private.chat_summary(c.id) item, c.last_message_sequence seq from public.chat_conversations c
    where v_actor in (c.founder_user_id, c.tester_user_id) and c.last_message_sequence > 0
      and (p_before is null or c.last_message_sequence < p_before)
    order by c.last_message_sequence desc limit 30
  ) page;
  if jsonb_array_length(v_items) = 30 then v_more := (v_items->29->>'lastSequence')::bigint; end if;
  select count(*) into v_unread from public.chat_messages m join public.chat_read_states r
    on r.conversation_id = m.conversation_id and r.user_id = v_actor
    where m.sender_user_id <> v_actor and m.sequence > r.last_read_sequence;
  return jsonb_build_object('items', v_items, 'nextBefore', v_more, 'unreadCount', v_unread);
end;
$$;

create function private.chat_history(p_conversation_id uuid, p_before bigint) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_items jsonb; v_more bigint;
begin
  if not private.chat_is_member(p_conversation_id) then raise exception 'This conversation is unavailable.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(item order by seq), '[]') into v_items from (
    select jsonb_build_object('id', id, 'sequence', sequence, 'conversationId', conversation_id,
      'senderUserId', sender_user_id, 'body', body, 'createdAt', created_at) item, sequence seq
    from public.chat_messages where conversation_id = p_conversation_id and (p_before is null or sequence < p_before)
    order by sequence desc limit 50
  ) page;
  if jsonb_array_length(v_items) = 50 then v_more := (v_items->0->>'sequence')::bigint; end if;
  return jsonb_build_object('items', v_items, 'nextBefore', v_more);
end;
$$;

create function private.chat_send(p_request_id uuid, p_body text, p_conversation_id uuid, p_response_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_conversation public.chat_conversations; v_existing public.chat_messages;
  v_message public.chat_messages; v_response record; v_recipient uuid; v_epoch uuid; v_now timestamptz := now();
begin
  if p_request_id is null or p_body is null or char_length(p_body) not between 1 and 4000 or p_body !~ '[^[:space:]]' then
    raise exception 'Write a message between 1 and 4,000 characters.' using errcode = '22023';
  end if;
  -- Serializes sender-wide rate limits and idempotency across conversations.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 713));
  if p_conversation_id is null then
    select r.submission_id, r.tester_user_id into v_response from public.test_responses r
      join public.submissions s on s.id = r.submission_id
      where r.id = p_response_id and s.user_id = v_actor and r.tester_user_id is not null and r.tester_user_id <> v_actor;
    if not found then raise exception 'This tester is unavailable for messaging.' using errcode = '42501'; end if;
    insert into public.chat_conversations(submission_id, founder_user_id, tester_user_id)
      values (v_response.submission_id, v_actor, v_response.tester_user_id) on conflict (submission_id, tester_user_id) do nothing;
    select * into v_conversation from public.chat_conversations where submission_id = v_response.submission_id
      and tester_user_id = v_response.tester_user_id for update;
  else
    select * into v_conversation from public.chat_conversations where id = p_conversation_id
      and v_actor in (founder_user_id, tester_user_id) for update;
  end if;
  if v_conversation.id is null then raise exception 'This conversation is unavailable.' using errcode = '42501'; end if;
  v_recipient := case when v_actor = v_conversation.founder_user_id then v_conversation.tester_user_id else v_conversation.founder_user_id end;
  if not exists (select 1 from public.profiles where id = v_recipient and ban_status = 'clear') then
    raise exception 'This person is unavailable for messaging.' using errcode = '42501';
  end if;
  select * into v_existing from public.chat_messages where sender_user_id = v_actor and client_request_id = p_request_id;
  if found then
    if v_existing.conversation_id <> v_conversation.id or v_existing.body <> p_body then
      raise exception 'This send request was already used for another message.' using errcode = '22023';
    end if;
    return jsonb_build_object('conversationId', v_conversation.id, 'messageId', v_existing.id);
  end if;
  if (select count(*) from public.chat_messages where sender_user_id = v_actor and created_at > v_now - interval '1 minute') >= 20 then
    raise exception 'You are sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  insert into public.chat_read_states(conversation_id, user_id) values
    (v_conversation.id, v_actor), (v_conversation.id, v_recipient) on conflict do nothing;
  insert into public.chat_messages(conversation_id, sender_user_id, client_request_id, body)
    values (v_conversation.id, v_actor, p_request_id, p_body) returning * into v_message;
  update public.chat_conversations set last_message_sequence = v_message.sequence where id = v_conversation.id;
  insert into public.chat_notification_outbox(conversation_id, recipient_user_id, message_id, stage)
    values (v_conversation.id, v_recipient, v_message.id, 0);
  select unread_epoch into v_epoch from public.chat_read_states where conversation_id = v_conversation.id and user_id = v_recipient;
  if v_epoch is null then
    v_epoch := gen_random_uuid();
    update public.chat_read_states set unread_epoch = v_epoch, unread_since = v_now
      where conversation_id = v_conversation.id and user_id = v_recipient;
    insert into public.chat_notification_outbox(conversation_id, recipient_user_id, unread_epoch, stage, next_attempt_at)
      values (v_conversation.id, v_recipient, v_epoch, 3, v_now + interval '3 days'),
             (v_conversation.id, v_recipient, v_epoch, 7, v_now + interval '7 days');
  end if;
  return jsonb_build_object('conversationId', v_conversation.id, 'messageId', v_message.id);
end;
$$;

create function private.chat_mark_read(p_conversation_id uuid, p_sequence bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_read bigint;
begin
  perform 1 from public.chat_conversations where id = p_conversation_id and v_actor in (founder_user_id, tester_user_id) for update;
  if not found then raise exception 'This conversation is unavailable.' using errcode = '42501'; end if;
  if not exists (select 1 from public.chat_messages where conversation_id = p_conversation_id and sequence = p_sequence) then
    raise exception 'Invalid displayed message.' using errcode = '22023';
  end if;
  update public.chat_read_states set last_read_sequence = greatest(last_read_sequence, p_sequence)
    where conversation_id = p_conversation_id and user_id = v_actor returning last_read_sequence into v_read;
  if not exists (select 1 from public.chat_messages where conversation_id = p_conversation_id and sender_user_id <> v_actor and sequence > v_read) then
    update public.chat_read_states set unread_epoch = null, unread_since = null where conversation_id = p_conversation_id and user_id = v_actor;
    update public.chat_notification_outbox set status = 'cancelled', lease_id = null, lease_until = null
      where conversation_id = p_conversation_id and recipient_user_id = v_actor and stage <> 0 and status in ('pending','processing','failed');
  end if;
end;
$$;

-- Exposed wrappers cannot elevate privilege; private helpers enforce every caller.
create function public.chat_context(p_response_id uuid default null, p_conversation_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.chat_context(p_response_id, p_conversation_id); $$;
create function public.chat_list(p_before bigint default null) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.chat_list(p_before); $$;
create function public.chat_history(p_conversation_id uuid, p_before bigint default null) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.chat_history(p_conversation_id, p_before); $$;
create function public.chat_send(p_request_id uuid, p_body text, p_conversation_id uuid default null, p_response_id uuid default null) returns jsonb
language sql security invoker set search_path = '' as $$ select private.chat_send(p_request_id, p_body, p_conversation_id, p_response_id); $$;
create function public.chat_mark_read(p_conversation_id uuid, p_sequence bigint) returns void
language sql security invoker set search_path = '' as $$ select private.chat_mark_read(p_conversation_id, p_sequence); $$;

revoke all on function private.chat_actor(), private.chat_is_member(uuid), private.chat_summary(uuid),
  private.chat_context(uuid, uuid), private.chat_list(bigint), private.chat_history(uuid, bigint),
  private.chat_send(uuid, text, uuid, uuid), private.chat_mark_read(uuid, bigint),
  public.chat_context(uuid, uuid), public.chat_list(bigint), public.chat_history(uuid, bigint),
  public.chat_send(uuid, text, uuid, uuid), public.chat_mark_read(uuid, bigint) from public, anon, authenticated;
grant execute on function private.chat_actor(), private.chat_is_member(uuid),
  private.chat_context(uuid, uuid), private.chat_list(bigint), private.chat_history(uuid, bigint),
  private.chat_send(uuid, text, uuid, uuid), private.chat_mark_read(uuid, bigint),
  public.chat_context(uuid, uuid), public.chat_list(bigint), public.chat_history(uuid, bigint),
  public.chat_send(uuid, text, uuid, uuid), public.chat_mark_read(uuid, bigint) to authenticated;

-- Service-only queue RPCs use invoker rights. No browser can claim or render jobs.
create function public.claim_chat_notifications(p_limit integer default 25) returns setof public.chat_notification_outbox
language sql security invoker set search_path = '' as $$
  with exhausted as (
    update public.chat_notification_outbox set status = 'failed', lease_id = null, lease_until = null,
      last_error = 'Delivery confirmation unavailable after the final attempt.'
    where status = 'processing' and lease_until < now() and attempt_count >= 5 returning id
  ), due as (
    select id from public.chat_notification_outbox where attempt_count < 5 and next_attempt_at <= now()
      and (status in ('pending','failed') or (status = 'processing' and lease_until < now()))
    order by next_attempt_at limit least(greatest(coalesce(p_limit,25),1),100) for update skip locked
  ) update public.chat_notification_outbox q set status = 'processing', attempt_count = attempt_count + 1,
    lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes'
    from due where q.id = due.id returning q.*;
$$;
create function public.chat_notification_context(p_id uuid, p_lease uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_job public.chat_notification_outbox; v_message public.chat_messages; v_result jsonb;
begin
  select * into v_job from public.chat_notification_outbox where id = p_id and lease_id = p_lease and status = 'processing' and lease_until > now();
  if not found then return null; end if;
  if v_job.stage = 0 then
    select * into v_message from public.chat_messages where id = v_job.message_id;
  else
    select m.* into v_message from public.chat_messages m join public.chat_read_states r on r.conversation_id = m.conversation_id
      where r.conversation_id = v_job.conversation_id and r.user_id = v_job.recipient_user_id and r.unread_epoch = v_job.unread_epoch
        and m.sender_user_id <> r.user_id and m.sequence > r.last_read_sequence order by m.sequence limit 1;
  end if;
  select jsonb_build_object('email', recipient.email, 'productName', s.product_name, 'body', v_message.body,
    'founderSent', v_message.sender_user_id = c.founder_user_id, 'conversationId', c.id,
    'submissionId', s.id, 'stage', v_job.stage) into v_result
    from public.chat_conversations c join public.submissions s on s.id = c.submission_id
    join public.profiles recipient on recipient.id = v_job.recipient_user_id and recipient.ban_status = 'clear'
    join public.profiles sender on sender.id = v_message.sender_user_id and sender.ban_status = 'clear'
    where c.id = v_job.conversation_id and v_message.id is not null;
  if v_result is null then
    update public.chat_notification_outbox set status = 'cancelled', lease_id = null, lease_until = null where id = p_id and lease_id = p_lease;
  end if;
  return v_result;
end;
$$;
create function public.finish_chat_notification(p_id uuid, p_lease uuid, p_provider_id text, p_error text default null) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.chat_notification_outbox set status = case when p_error is null then 'sent' else 'failed' end,
    provider_message_id = p_provider_id, last_error = left(p_error, 500),
    sent_at = case when p_error is null then now() else null end,
    next_attempt_at = now() + make_interval(mins => least(240, (power(2, attempt_count)::integer))), lease_id = null, lease_until = null
    where id = p_id and lease_id = p_lease and status = 'processing';
  return found;
end;
$$;
revoke all on function public.claim_chat_notifications(integer), public.chat_notification_context(uuid,uuid), public.finish_chat_notification(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_chat_notifications(integer), public.chat_notification_context(uuid,uuid), public.finish_chat_notification(uuid,uuid,text,text) to service_role;

-- Template registry entry supports existing email-delivery logs; HTML is generated from tokens.
insert into public.email_templates(key, description, subject_template, text_template, html_template)
values ('chat_message', 'Private chat messages and unread reminders.', '{{headline}}', '{{headline}}\n{{excerpt}}\n{{messageUrl}}', '')
on conflict (key) do nothing;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_conversations, public.chat_messages, public.chat_read_states;
  end if;
end; $$;

create function private.dispatch_chat_notifications() returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' order by created_at desc limit 1' into v_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''chat_dispatch_secret'' order by created_at desc limit 1' into v_secret;
  if nullif(v_url, '') is null or nullif(v_secret, '') is null then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb, timeout_milliseconds := 10000)'
    into v_request using rtrim(v_url, '/') || '/functions/v1/dispatch-chat-notifications',
      jsonb_build_object('Content-Type','application/json','x-chat-dispatch-secret',v_secret);
  return v_request;
end;
$$;
revoke all on function private.dispatch_chat_notifications() from public, anon, authenticated;
do $$ begin
  if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
    perform cron.schedule('dispatch-chat-notifications', '* * * * *', 'select private.dispatch_chat_notifications()');
  else raise notice 'Chat notifications require pg_cron, pg_net and Vault configuration before rollout.';
  end if;
end; $$;
