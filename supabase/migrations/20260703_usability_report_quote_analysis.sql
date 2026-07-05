create table if not exists public.usability_report_quote_analyses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  model text not null,
  prompt_version text not null,
  input_hash text not null,
  quote_count integer not null default 0 check (quote_count >= 0),
  analysis_json jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (report_id)
);

create index if not exists usability_report_quote_analyses_report_idx
  on public.usability_report_quote_analyses (report_id);

alter table public.usability_report_quote_analyses enable row level security;

drop trigger if exists usability_report_quote_analyses_set_updated_at on public.usability_report_quote_analyses;
create trigger usability_report_quote_analyses_set_updated_at
  before update on public.usability_report_quote_analyses
  for each row execute procedure public.set_current_timestamp_updated_at();

drop policy if exists "usability_report_quote_analyses_select_own" on public.usability_report_quote_analyses;
create policy "usability_report_quote_analyses_select_own"
  on public.usability_report_quote_analyses for select
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quote_analyses.report_id
        and reports.owner_user_id = auth.uid()
    )
  );

grant select on public.usability_report_quote_analyses to authenticated;
