create table if not exists public.shared_report_recipients (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports(id) on delete cascade,
  recipient_name text not null,
  recipient_email text not null,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists shared_report_recipients_report_id_idx
  on public.shared_report_recipients(report_id);

create index if not exists shared_report_recipients_created_by_user_id_idx
  on public.shared_report_recipients(created_by_user_id);

create index if not exists shared_report_recipients_recipient_email_idx
  on public.shared_report_recipients(recipient_email);