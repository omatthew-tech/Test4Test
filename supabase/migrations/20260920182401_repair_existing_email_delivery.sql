-- Repair existing notification delivery only; no new email type or schedule.
-- Preserve the NOT NULL next_send_at contract used by the original schema.
with delivered as (
  select distinct on (s.id) s.id, l.created_at as sent_at
  from public.test_back_reminder_sequences s
  join public.email_delivery_logs l
    on l.reminder_sequence_id = s.id
   and l.related_response_id = s.latest_triggering_response_id
   and l.template_key = 'test_back_reminder_stage_3'
   and l.status = 'sent'
  where s.status = 'pending' and s.emails_sent = 2
  order by s.id, l.created_at desc
)
update public.test_back_reminder_sequences s
set emails_sent = 3, status = 'resolved', resolved_reason = 'sequence_complete',
    last_sent_at = delivered.sent_at, next_send_at = delivered.sent_at,
    resolved_at = delivered.sent_at, affects_test_back_rate = true,
    updated_at = now()
from delivered where s.id = delivered.id;

update public.test_back_reminder_sequences s
set status = 'resolved', resolved_reason = 'tested_back',
    resolved_at = now(), next_send_at = now(), updated_at = now()
where s.status = 'pending'
  and public.has_tested_back(s.owner_user_id, s.tester_user_id);

update public.test_back_reminder_sequences s
set status = 'cancelled', resolved_reason = 'missing_target_submission',
    resolved_at = now(), next_send_at = now(), updated_at = now()
where s.status = 'pending'
  and not exists (
    select 1 from public.find_test_back_target_submission(s.tester_user_id, s.owner_user_id)
  );

-- The existing Google Play sender constructs its copy in code but its logging
-- foreign key still requires this registry row. Do not overwrite editable copy.
insert into public.email_templates
  (key, description, subject_template, text_template, html_template)
values (
  'google_play_closed_test_check_in_reminder',
  'Existing daily closed-test check-in reminder; rendered by its Edge Function.',
  'Check in for {{productName}}''s Google Play closed test',
  'You are testing {{productName}} for Google Play''s 14-day closed-test requirement. Today is day {{dayLabel}}. Open the app and check in before the day ends to keep the streak consecutive. {{testUrl}}',
  '<p>You are testing {{productName}} for Google Play''s 14-day closed-test requirement.</p><p>Today is day {{dayLabel}}. Open the app and check in before the day ends to keep the streak consecutive.</p><a href="{{testUrl}}">Check in today</a>'
) on conflict (key) do nothing;

-- Service-only read, using the caller's existing table privileges and RLS.
create or replace function public.list_due_google_play_reminders(
  p_reference_date date default (now() at time zone 'utc')::date,
  p_limit integer default 50
)
returns setof public.google_play_closed_test_participations
language sql stable security invoker set search_path = ''
as $$
  select p.* from public.google_play_closed_test_participations p
  where p.status = 'active'
    and p.started_on <= p_reference_date
    and not exists (
      select 1 from public.google_play_closed_test_check_ins c
      where c.participation_id = p.id and c.check_in_date = p_reference_date
    )
    and not exists (
      select 1 from public.email_delivery_logs l
      where l.template_key = 'google_play_closed_test_check_in_reminder'
        and l.recipient_user_id = p.tester_user_id
        and l.related_submission_id = p.submission_id
        and l.status = 'sent'
        and l.created_at >= (p_reference_date::timestamp at time zone 'utc')
        and l.created_at < ((p_reference_date + 1)::timestamp at time zone 'utc')
    )
  order by p.started_on, p.id
  limit greatest(1, least(100, coalesce(p_limit, 50)));
$$;
revoke all on function public.list_due_google_play_reminders(date, integer) from public, anon, authenticated;
grant execute on function public.list_due_google_play_reminders(date, integer) to service_role;

-- Keep both existing schedules, URLs and Vault headers intact. Only extend the
-- pg_net timeout so multi-email batches can finish and return their result.
do $repair_cron$
declare
  job record;
  patched text;
begin
  if to_regclass('cron.job') is null then return; end if;
  for job in select jobid, command from cron.job
    where jobname in ('send-test-back-reminders-hourly', 'send-google-play-closed-test-reminders-daily')
  loop
    if job.command ~* 'timeout_milliseconds' then continue; end if;
    patched := regexp_replace(job.command,
      '\)\s+as\s+request_id\s*;',
      ', timeout_milliseconds := 120000) as request_id;', 'i');
    if patched = job.command then
      raise exception 'Unrecognized email cron command for job %', job.jobid;
    end if;
    perform cron.alter_job(job.jobid, command := patched);
  end loop;
end;
$repair_cron$;
