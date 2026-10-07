-- Either verified participant may start a conversation from their response.
-- Keep participant checks, RLS, rate limits, idempotency, and notification handling intact.
-- Replacing existing private functions preserves their restricted EXECUTE grants.

create or replace function private.chat_context(p_response_id uuid, p_conversation_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_result jsonb; v_response record;
begin
  if p_conversation_id is not null then
    v_result := private.chat_summary(p_conversation_id);
  else
    select r.submission_id, r.tester_user_id, s.product_name, p.display_name, p.ban_status into v_response
    from public.test_responses r join public.submissions s on s.id = r.submission_id
    join public.profiles p on p.id = case when v_actor = s.user_id then r.tester_user_id else s.user_id end
    where r.id = p_response_id and v_actor in (s.user_id, r.tester_user_id)
      and r.tester_user_id is not null and r.tester_user_id <> s.user_id;
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

create or replace function private.chat_send(p_request_id uuid, p_body text, p_conversation_id uuid, p_response_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.chat_actor(); v_conversation public.chat_conversations; v_existing public.chat_messages;
  v_message public.chat_messages; v_response record; v_recipient uuid; v_epoch uuid; v_now timestamptz := now();
begin
  if p_request_id is null or p_body is null or char_length(p_body) not between 1 and 4000 or p_body !~ '[^[:space:]]' then
    raise exception 'Write a message between 1 and 4,000 characters.' using errcode = '22023';
  end if;
  -- Serializes sender-wide rate limits and idempotency across conversations.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 713));
  if p_conversation_id is null then
    select r.submission_id, s.user_id as founder_user_id, r.tester_user_id into v_response from public.test_responses r
      join public.submissions s on s.id = r.submission_id
      where r.id = p_response_id and v_actor in (s.user_id, r.tester_user_id)
        and r.tester_user_id is not null and r.tester_user_id <> s.user_id;
    if not found then raise exception 'This conversation is unavailable.' using errcode = '42501'; end if;
    insert into public.chat_conversations(submission_id, founder_user_id, tester_user_id)
      values (v_response.submission_id, v_response.founder_user_id, v_response.tester_user_id) on conflict (submission_id, tester_user_id) do nothing;
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
