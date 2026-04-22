create extension if not exists pg_net;
create extension if not exists vault;

create or replace function public.enqueue_new_feedback_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url text;
  v_reminder_secret text;
begin
  if new.status <> 'approved'
     or not coalesce(new.credit_awarded, false)
     or new.owner_notified_at is not null then
    return new;
  end if;

  select decrypted_secret
  into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into v_reminder_secret
  from vault.decrypted_secrets
  where name = 'test_back_reminder_cron_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_project_url, '') = '' or coalesce(v_reminder_secret, '') = '' then
    raise notice 'Skipping new feedback notification because Vault secrets project_url or test_back_reminder_cron_secret are missing.';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/send-test-results-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', v_reminder_secret
    ),
    body := jsonb_build_object(
      'responseId', new.id,
      'source', 'database_trigger'
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

drop trigger if exists enqueue_new_feedback_notification_on_response on public.test_responses;
create trigger enqueue_new_feedback_notification_on_response
  after insert or update of status, credit_awarded on public.test_responses
  for each row execute procedure public.enqueue_new_feedback_notification();
