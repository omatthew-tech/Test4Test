create table if not exists public.admin_users (
  email text primary key check (email = lower(email)),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.admin_users (email)
values ('support@test4test.io')
on conflict (email) do nothing;

create table if not exists public.submission_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('app_unavailable', 'requires_payment', 'suspicious_malware', 'other')),
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'confirmed')),
  support_notified_at timestamptz,
  support_notification_error text,
  decision_note text not null default '',
  decided_by_user_id uuid references public.profiles (id) on delete set null,
  decided_by_email text,
  decided_at timestamptz,
  credited_transaction_id uuid references public.credit_transactions (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

create unique index if not exists submission_reports_one_pending_per_reporter_submission
  on public.submission_reports (submission_id, reporter_user_id)
  where status = 'pending';

create index if not exists submission_reports_reporter_idx
  on public.submission_reports (reporter_user_id, status);

create index if not exists submission_reports_submission_idx
  on public.submission_reports (submission_id, status);

alter table public.admin_users enable row level security;
alter table public.submission_reports enable row level security;

drop policy if exists "submission_reports_select_own" on public.submission_reports;
create policy "submission_reports_select_own"
  on public.submission_reports for select
  using (reporter_user_id = auth.uid());

grant select on public.submission_reports to authenticated;

drop trigger if exists submission_reports_set_updated_at on public.submission_reports;
create trigger submission_reports_set_updated_at
  before update on public.submission_reports
  for each row execute procedure public.set_current_timestamp_updated_at();

create or replace function public.enforce_owner_submission_review_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.user_id and old.status <> 'live' then
    new.status := 'pending_verification';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_owner_submission_review_state_on_submissions on public.submissions;
create trigger enforce_owner_submission_review_state_on_submissions
  before update on public.submissions
  for each row execute procedure public.enforce_owner_submission_review_state();

insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values
  (
    'test_report_support',
    'Internal support notification when a tester reports an app from the test page.',
    'Reported app: {{appName}}',
    'A tester reported {{appName}} for {{reasonLabel}}.',
    '<p>A tester reported <strong>{{appName}}</strong> for <strong>{{reasonLabel}}</strong>.</p>'
  ),
  (
    'test_report_reporter_ok',
    'Sent to a reporter when support decides the app is okay to test.',
    'We reviewed your report for {{appName}}',
    'We investigated your report for {{appName}} and it is safe to test.',
    '<p>We investigated your report for <strong>{{appName}}</strong> and it is safe to test.</p>'
  ),
  (
    'test_report_reporter_not_ok',
    'Sent to a reporter when support confirms the app should not be tested.',
    'Thanks for reporting {{appName}}',
    'Thanks for reporting {{appName}}. We added a free credit to your account.',
    '<p>Thanks for reporting <strong>{{appName}}</strong>. We added a free credit to your account.</p>'
  ),
  (
    'test_report_founder_not_ok',
    'Sent to a founder when support pauses a reported app.',
    '{{appName}} has been paused',
    '{{appName}} has been paused after a tester report.',
    '<p><strong>{{appName}}</strong> has been paused after a tester report.</p>'
  )
on conflict (key) do update
  set description = excluded.description,
      subject_template = excluded.subject_template,
      text_template = excluded.text_template,
      html_template = excluded.html_template,
      updated_at = timezone('utc', now());
