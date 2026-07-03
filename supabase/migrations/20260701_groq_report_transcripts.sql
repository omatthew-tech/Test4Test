create table if not exists public.test_response_transcripts (
  id uuid primary key default gen_random_uuid(),
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  provider text not null,
  model text not null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  language text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  full_text text not null default '',
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (test_response_id, provider, model)
);

create table if not exists public.test_response_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.test_response_transcripts (id) on delete cascade,
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  text text not null check (length(btrim(text)) > 0),
  words jsonb,
  avg_logprob numeric,
  no_speech_prob numeric,
  compression_ratio numeric,
  created_at timestamptz not null default timezone('utc', now()),
  unique (transcript_id, segment_index)
);

create index if not exists test_response_transcripts_response_idx
  on public.test_response_transcripts (test_response_id, provider, model);

create index if not exists test_response_transcript_segments_response_time_idx
  on public.test_response_transcript_segments (test_response_id, start_ms, end_ms);

create table if not exists public.usability_report_quotes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports (id) on delete cascade,
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  frame_id uuid references public.usability_report_frames (id) on delete set null,
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

alter table public.usability_report_quotes
  add column if not exists transcript_segment_id uuid references public.test_response_transcript_segments (id) on delete set null,
  add column if not exists start_ms integer check (start_ms is null or start_ms >= 0),
  add column if not exists end_ms integer check (end_ms is null or end_ms >= coalesce(start_ms, 0)),
  add column if not exists include_in_summary boolean not null default true;

create index if not exists usability_report_quotes_segment_idx
  on public.usability_report_quotes (transcript_segment_id)
  where transcript_segment_id is not null;

create index if not exists usability_report_quotes_frame_time_idx
  on public.usability_report_quotes (frame_id, start_ms, end_ms);

create unique index if not exists usability_report_quotes_report_segment_unique_idx
  on public.usability_report_quotes (report_id, transcript_segment_id)
  where transcript_segment_id is not null;

alter table public.test_response_transcripts enable row level security;
alter table public.test_response_transcript_segments enable row level security;

drop trigger if exists test_response_transcripts_set_updated_at on public.test_response_transcripts;
create trigger test_response_transcripts_set_updated_at
  before update on public.test_response_transcripts
  for each row execute procedure public.set_current_timestamp_updated_at();

drop policy if exists "test_response_transcripts_select_related" on public.test_response_transcripts;
create policy "test_response_transcripts_select_related"
  on public.test_response_transcripts for select
  using (
    exists (
      select 1
      from public.test_responses responses
      join public.submissions submissions on submissions.id = responses.submission_id
      where responses.id = test_response_transcripts.test_response_id
        and (
          submissions.user_id = auth.uid()
          or responses.tester_user_id = auth.uid()
        )
    )
  );

drop policy if exists "test_response_transcript_segments_select_related" on public.test_response_transcript_segments;
create policy "test_response_transcript_segments_select_related"
  on public.test_response_transcript_segments for select
  using (
    exists (
      select 1
      from public.test_responses responses
      join public.submissions submissions on submissions.id = responses.submission_id
      where responses.id = test_response_transcript_segments.test_response_id
        and (
          submissions.user_id = auth.uid()
          or responses.tester_user_id = auth.uid()
        )
    )
  );

drop policy if exists "usability_report_quotes_update_summary_inclusion" on public.usability_report_quotes;
create policy "usability_report_quotes_update_summary_inclusion"
  on public.usability_report_quotes for update
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quotes.report_id
        and reports.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quotes.report_id
        and reports.owner_user_id = auth.uid()
    )
  );

grant select on public.test_response_transcripts to authenticated;
grant select on public.test_response_transcript_segments to authenticated;
grant select on public.usability_report_quotes to authenticated;
grant update (include_in_summary) on public.usability_report_quotes to authenticated;
