create table if not exists public.usability_report_shares (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  recipient_user_id uuid references public.profiles (id) on delete set null,
  recipient_name text not null,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'opened', 'failed')),
  provider_message_id text,
  error_message text,
  invited_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (report_id, recipient_email),
  check (char_length(trim(recipient_name)) between 1 and 100),
  check (recipient_email = lower(trim(recipient_email))),
  check (char_length(recipient_email) between 3 and 320)
);

create index if not exists usability_report_shares_owner_idx
  on public.usability_report_shares (owner_user_id, invited_at desc);

create index if not exists usability_report_shares_recipient_idx
  on public.usability_report_shares (recipient_email, report_id);

alter table public.usability_report_shares enable row level security;

drop trigger if exists usability_report_shares_set_updated_at on public.usability_report_shares;
create trigger usability_report_shares_set_updated_at
  before update on public.usability_report_shares
  for each row execute procedure public.set_current_timestamp_updated_at();

drop policy if exists "usability_report_shares_select_owner" on public.usability_report_shares;
create policy "usability_report_shares_select_owner"
  on public.usability_report_shares for select
  using (owner_user_id = auth.uid());

drop policy if exists "usability_report_shares_select_recipient" on public.usability_report_shares;
create policy "usability_report_shares_select_recipient"
  on public.usability_report_shares for select
  using (recipient_email = lower(coalesce(auth.jwt() ->> 'email', '')));

grant select on public.usability_report_shares to authenticated;

insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values (
  'usability_report_share_invite',
  'Sent when a report owner invites someone to view a usability report.',
  '{{senderName}} shared a usability report with you',
  $usability_report_share_text$
Hi {{recipientName}},

{{senderName}} shared “{{reportName}}” for {{productName}} with you on Test4Test.

Sign in with {{recipientEmail}} to view the report:
{{reportUrl}}

This invitation only grants access to the email address it was sent to.

Happy Testing!
$usability_report_share_text$,
  $usability_report_share_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{recipientName}},</p>
  <p><strong>{{senderName}}</strong> shared <strong>“{{reportName}}”</strong> for {{productName}} with you on Test4Test.</p>
  <p>
    <a href="{{reportUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #231f1c; text-decoration: none; font-weight: 600;">
      View report
    </a>
  </p>
  <p style="color: #6f655d; font-size: 14px;">Sign in with {{recipientEmail}}. This invitation only grants access to the email address it was sent to.</p>
</div>
$usability_report_share_html$
)
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());
