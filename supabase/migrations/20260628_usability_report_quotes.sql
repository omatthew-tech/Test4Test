-- Tester quotes captured at exact moments in a recording, linked to the
-- screenshot (usability_report_frames) that was on screen at that time. Used on
-- both the report summary view and individual response pages.
create table if not exists public.usability_report_quotes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports (id) on delete cascade,
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  -- The linked screenshot. Nullable so a quote is never lost if its frame is
  -- removed/regenerated; set null on delete keeps the quote with no link.
  frame_id uuid references public.usability_report_frames (id) on delete set null,
  -- Exact offset of the quote within the source recording, in milliseconds.
  timestamp_ms integer not null check (timestamp_ms >= 0),
  quote_text text not null check (length(btrim(quote_text)) > 0),
  speaker text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, test_response_id, timestamp_ms, quote_text)
);

create index if not exists usability_report_quotes_report_idx
  on public.usability_report_quotes (report_id, test_response_id, timestamp_ms);

create index if not exists usability_report_quotes_frame_idx
  on public.usability_report_quotes (frame_id);

alter table public.usability_report_quotes enable row level security;

drop policy if exists "usability_report_quotes_select_own" on public.usability_report_quotes;
create policy "usability_report_quotes_select_own"
  on public.usability_report_quotes for select
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quotes.report_id
        and reports.owner_user_id = auth.uid()
    )
  );

grant select on public.usability_report_quotes to authenticated;
