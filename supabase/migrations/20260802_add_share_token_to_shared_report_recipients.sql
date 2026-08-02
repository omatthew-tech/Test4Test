alter table public.shared_report_recipients
  add column if not exists share_token text;

update public.shared_report_recipients
set share_token = encode(gen_random_bytes(16), 'hex')
where share_token is null;

alter table public.shared_report_recipients
  alter column share_token set not null;

create unique index if not exists shared_report_recipients_share_token_idx
  on public.shared_report_recipients(share_token);