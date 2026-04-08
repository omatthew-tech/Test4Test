create table if not exists public.email_templates (
  key text primary key,
  description text not null default '',
  subject_template text not null,
  text_template text not null,
  html_template text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.test_back_reminder_sequences (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  tester_user_id uuid not null references public.profiles (id) on delete cascade,
  latest_triggering_response_id uuid not null references public.test_responses (id) on delete cascade,
  latest_triggering_submission_id uuid not null references public.submissions (id) on delete cascade,
  emails_sent integer not null default 0 check (emails_sent between 0 and 3),
  next_send_at timestamptz not null default timezone('utc', now()),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'cancelled')),
  resolved_reason text check (resolved_reason in ('tested_back', 'sequence_complete', 'missing_target_submission')),
  last_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_user_id, tester_user_id),
  check (owner_user_id <> tester_user_id)
);

create index if not exists test_back_reminder_sequences_due_idx
  on public.test_back_reminder_sequences (next_send_at)
  where status = 'pending';

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.email_templates (key),
  recipient_user_id uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  related_response_id uuid references public.test_responses (id) on delete set null,
  related_submission_id uuid references public.submissions (id) on delete set null,
  reminder_sequence_id uuid references public.test_back_reminder_sequences (id) on delete set null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_name text not null default 'smtp2go',
  provider_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.email_templates enable row level security;
alter table public.test_back_reminder_sequences enable row level security;
alter table public.email_delivery_logs enable row level security;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists test_back_reminder_sequences_set_updated_at on public.test_back_reminder_sequences;
create trigger test_back_reminder_sequences_set_updated_at
  before update on public.test_back_reminder_sequences
  for each row execute procedure public.set_current_timestamp_updated_at();

insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values
  (
    'new_feedback',
    'Sent when fresh approved feedback is ready and no reciprocal test-back reminder is needed.',
    'New feedback for {{ownerProductName}}',
    $new_feedback_text$
Hi {{ownerDisplayName}},

Someone just tested {{ownerProductName}}.

Your feedback is ready to review:
{{feedbackUrl}}

Open the response summary to spot patterns quickly, then dig into the raw responses when you want the full story.
$new_feedback_text$,
    $new_feedback_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p>Someone just tested <strong>{{ownerProductName}}</strong>.</p>
  <p>Your feedback is ready to review.</p>
  <p>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      View feedback
    </a>
  </p>
  <p style="margin-top: 18px; color: #6f655d;">
    Or open this link directly:
    <a href="{{feedbackUrl}}" style="color: #a34f25;">{{feedbackUrl}}</a>
  </p>
</div>
$new_feedback_html$
  ),
  (
    'test_back_reminder_stage_1',
    'Stage 1 reminder sent when someone tested your app and you still owe them a test back.',
    '{{testerDisplayName}} tested your app. Please test back {{targetProductName}}',
    $stage_1_text$
Hi {{ownerDisplayName}},

{{testerDisplayName}} just tested {{ownerProductName}}.

Please test back {{targetProductName}} while the exchange is still fresh:
{{testBackUrl}}

Your new feedback is also ready here:
{{feedbackUrl}}

Testing back helps keep your Test4Test exchange rate healthy and encourages more people to test your app.
$stage_1_text$,
    $stage_1_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p><strong>{{testerDisplayName}}</strong> just tested <strong>{{ownerProductName}}</strong>.</p>
  <p>Please test back <strong>{{targetProductName}}</strong> while the exchange is still fresh.</p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #a34f25; color: #fffaf6; text-decoration: none; font-weight: 600; margin-right: 10px;">
      Test back now
    </a>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f8e8dc; color: #8a3f1d; text-decoration: none; font-weight: 600;">
      View feedback
    </a>
  </p>
  <p style="color: #6f655d;">Testing back helps keep your Test4Test exchange rate healthy and encourages more people to test your app.</p>
</div>
$stage_1_html$
  ),
  (
    'test_back_reminder_stage_2',
    'Stage 2 reminder sent one day after the initial reminder if the owner still has not tested back.',
    'Friendly reminder: please test back {{targetProductName}}',
    $stage_2_text$
Hi {{ownerDisplayName}},

Friendly reminder: {{testerDisplayName}} tested {{ownerProductName}}, and you still have an open chance to test back {{targetProductName}}.

Test back now:
{{testBackUrl}}

If you need to revisit the feedback first, it is still here:
{{feedbackUrl}}
$stage_2_text$,
    $stage_2_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p>Friendly reminder: <strong>{{testerDisplayName}}</strong> tested <strong>{{ownerProductName}}</strong>, and you still have an open chance to test back <strong>{{targetProductName}}</strong>.</p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #a34f25; color: #fffaf6; text-decoration: none; font-weight: 600; margin-right: 10px;">
      Test back now
    </a>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f8e8dc; color: #8a3f1d; text-decoration: none; font-weight: 600;">
      View feedback
    </a>
  </p>
</div>
$stage_2_html$
  ),
  (
    'test_back_reminder_stage_3',
    'Stage 3 reminder sent one more day later if the owner still has not tested back.',
    'Final reminder: test back {{targetProductName}} to protect your test-back rate',
    $stage_3_text$
Hi {{ownerDisplayName}},

Final reminder: {{testerDisplayName}} tested {{ownerProductName}}, and you still have not tested back {{targetProductName}}.

Please test back here:
{{testBackUrl}}

If you do not test back, it can lower your test-back rate. Lower test-back rates can lead to fewer people choosing to test your app.

Your feedback is still waiting here:
{{feedbackUrl}}
$stage_3_text$,
    $stage_3_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p><strong>Final reminder:</strong> <strong>{{testerDisplayName}}</strong> tested <strong>{{ownerProductName}}</strong>, and you still have not tested back <strong>{{targetProductName}}</strong>.</p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #8f2f20; color: #fffaf6; text-decoration: none; font-weight: 600; margin-right: 10px;">
      Test back now
    </a>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f8e8dc; color: #8a3f1d; text-decoration: none; font-weight: 600;">
      View feedback
    </a>
  </p>
  <p style="color: #6f655d;">If you do not test back, it can lower your test-back rate. Lower test-back rates can lead to fewer people choosing to test your app.</p>
</div>
$stage_3_html$
  )
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());

create or replace function public.has_tested_back(
  p_owner_user_id uuid,
  p_tester_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.test_responses responses
    join public.submissions submissions
      on submissions.id = responses.submission_id
    where responses.tester_user_id = p_owner_user_id
      and submissions.user_id = p_tester_user_id
      and responses.status = 'approved'
      and responses.credit_awarded = true
  );
$$;

create or replace function public.find_test_back_target_submission(
  p_tester_user_id uuid,
  p_owner_user_id uuid
)
returns table (
  submission_id uuid,
  product_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    submissions.id,
    submissions.product_name
  from public.submissions submissions
  where submissions.user_id = p_tester_user_id
    and submissions.status = 'live'
    and submissions.is_open_for_more_tests = true
    and public.profile_is_clear(submissions.user_id)
    and not exists (
      select 1
      from public.test_responses responses
      where responses.submission_id = submissions.id
        and responses.tester_user_id = p_owner_user_id
        and responses.status = 'approved'
        and responses.credit_awarded = true
    )
  order by
    submissions.promoted desc,
    submissions.response_count asc,
    submissions.created_at desc
  limit 1;
$$;

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
          then test_back_reminder_sequences.next_send_at
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
        next_send_at = null,
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

drop trigger if exists sync_test_back_reminder_sequences on public.test_responses;
create trigger sync_test_back_reminder_sequences
  after insert or update of status, credit_awarded on public.test_responses
  for each row execute procedure public.sync_test_back_reminder_sequences();

