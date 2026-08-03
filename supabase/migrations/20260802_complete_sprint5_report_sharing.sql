alter table public.usability_report_shares
  add column if not exists reminders_sent integer not null default 0,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists delivery_method text not null default 'email';

alter table public.usability_report_shares
  drop constraint if exists usability_report_shares_reminders_sent_check;

alter table public.usability_report_shares
  add constraint usability_report_shares_reminders_sent_check
  check (reminders_sent between 0 and 3);

alter table public.usability_report_shares
  drop constraint if exists usability_report_shares_delivery_method_check;

alter table public.usability_report_shares
  add constraint usability_report_shares_delivery_method_check
  check (delivery_method in ('email', 'link'));

create index if not exists usability_report_shares_reminder_due_idx
  on public.usability_report_shares (next_reminder_at)
  where status = 'sent' and opened_at is null and reminders_sent < 3;

update public.usability_report_shares
set next_reminder_at = greatest(
  timezone('utc', now()),
  invited_at + interval '2 days'
)
where status = 'sent'
  and opened_at is null
  and delivery_method = 'email'
  and reminders_sent = 0
  and next_reminder_at is null;

insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values
  (
    'usability_report_share_reminder_1',
    'First reminder sent two days after a shared report invitation remains unopened.',
    '{{senderName}} shared a report with you',
    $share_reminder_1_text$
Hi {{recipientName}},

{{senderName}} shared usability feedback on {{productName}} and would like your take. It only takes a minute to create a free account and read it.

View {{reportName}}:
{{reportUrl}}

If you were not expecting this, you can ignore this email.
$share_reminder_1_text$,
    $share_reminder_1_html$
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff9f4;border-collapse:collapse;">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffefc;border:1px solid #e6ded6;border-radius:20px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1d1815;">Test4Test</td></tr>
      <tr><td style="padding:20px 32px 0;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#1d1815;">{{senderName}} shared a report with you</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4f4741;">Hi {{recipientName}},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4f4741;">{{senderName}} shared usability feedback on <strong style="color:#1d1815;">{{productName}}</strong> and would like your take. It only takes a minute to create a free account and read it.</p>
      </td></tr>
      <tr><td style="padding:8px 32px 28px;"><a href="{{reportUrl}}" style="display:inline-block;padding:14px 26px;border-radius:14px;background:#f58e56;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1d1815;text-decoration:none;">View the report &rarr;</a></td></tr>
    </table>
  </td></tr>
</table>
$share_reminder_1_html$
  ),
  (
    'usability_report_share_reminder_2',
    'Second reminder sent four days after a shared report invitation remains unopened.',
    'Still waiting for your eyes on {{productName}}',
    $share_reminder_2_text$
Hi {{recipientName}},

{{senderName}}'s usability report on {{productName}} is still here whenever you have a minute. Inside you will find feedback from every tester, screen by screen, plus a short summary of what is working and what is not.

Read {{reportName}}:
{{reportUrl}}

Creating an account is free and takes about a minute.
$share_reminder_2_text$,
    $share_reminder_2_html$
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff9f4;border-collapse:collapse;">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffefc;border:1px solid #e6ded6;border-radius:20px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1d1815;">Test4Test</td></tr>
      <tr><td style="padding:20px 32px 0;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#1d1815;">Still waiting for your eyes on this</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4f4741;">Hi {{recipientName}}, {{senderName}}'s usability report on <strong style="color:#1d1815;">{{productName}}</strong> is still here whenever you have a minute.</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4f4741;">&#10003;&nbsp; Feedback from every tester, screen by screen</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4f4741;">&#10003;&nbsp; A short summary of what is working and what is not</p>
      </td></tr>
      <tr><td style="padding:8px 32px 28px;"><a href="{{reportUrl}}" style="display:inline-block;padding:14px 26px;border-radius:14px;background:#f58e56;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1d1815;text-decoration:none;">Read the feedback &rarr;</a></td></tr>
    </table>
  </td></tr>
</table>
$share_reminder_2_html$
  ),
  (
    'usability_report_share_reminder_3',
    'Final reminder sent seven days after a shared report invitation remains unopened.',
    'Last reminder about {{reportName}}',
    $share_reminder_3_text$
Hi {{recipientName}},

This is the last time we will email you about the report {{senderName}} shared on {{productName}}. The link stays active if you want to look later.

View {{reportName}}:
{{reportUrl}}

No more reminders will be sent after this one.
$share_reminder_3_text$,
    $share_reminder_3_html$
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff9f4;border-collapse:collapse;">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffefc;border:1px solid #e6ded6;border-radius:20px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1d1815;">Test4Test</td></tr>
      <tr><td style="padding:20px 32px 0;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#1d1815;">Last reminder about this report</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4f4741;">Hi {{recipientName}}, this is the last time we will email you about the report {{senderName}} shared on <strong style="color:#1d1815;">{{productName}}</strong>. The link stays active if you want to look later.</p>
      </td></tr>
      <tr><td style="padding:8px 32px 16px;"><a href="{{reportUrl}}" style="display:inline-block;padding:14px 26px;border-radius:14px;background:#f58e56;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1d1815;text-decoration:none;">View the report &rarr;</a></td></tr>
      <tr><td style="padding:0 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#857b74;">No more reminders after this one.</td></tr>
    </table>
  </td></tr>
</table>
$share_reminder_3_html$
  )
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());

notify pgrst, 'reload schema';
