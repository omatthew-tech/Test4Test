create table if not exists public.usability_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  report_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  source_response_count integer not null default 0,
  frame_count integer not null default 0,
  worker_job_id text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (submission_id, report_number)
);

create table if not exists public.usability_report_sources (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports (id) on delete cascade,
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  recording_bucket text not null,
  recording_path text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, test_response_id)
);

create table if not exists public.usability_report_frames (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.usability_reports (id) on delete cascade,
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  frame_index integer not null,
  timestamp_ms integer not null,
  storage_bucket text not null,
  storage_key text not null,
  width integer,
  height integer,
  content_type text not null default 'image/webp',
  size_bytes integer,
  perceptual_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, test_response_id, frame_index),
  unique (report_id, storage_bucket, storage_key)
);

create index if not exists usability_reports_owner_created_idx
  on public.usability_reports (owner_user_id, created_at desc);

create index if not exists usability_reports_submission_number_idx
  on public.usability_reports (submission_id, report_number desc);

create index if not exists usability_report_frames_report_idx
  on public.usability_report_frames (report_id, test_response_id, frame_index);

alter table public.usability_reports enable row level security;
alter table public.usability_report_sources enable row level security;
alter table public.usability_report_frames enable row level security;

drop trigger if exists usability_reports_set_updated_at on public.usability_reports;
create trigger usability_reports_set_updated_at
  before update on public.usability_reports
  for each row execute procedure public.set_current_timestamp_updated_at();

drop policy if exists "usability_reports_select_own" on public.usability_reports;
create policy "usability_reports_select_own"
  on public.usability_reports for select
  using (owner_user_id = auth.uid());

drop policy if exists "usability_report_sources_select_own" on public.usability_report_sources;
create policy "usability_report_sources_select_own"
  on public.usability_report_sources for select
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_sources.report_id
        and reports.owner_user_id = auth.uid()
    )
  );

drop policy if exists "usability_report_frames_select_own" on public.usability_report_frames;
create policy "usability_report_frames_select_own"
  on public.usability_report_frames for select
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_frames.report_id
        and reports.owner_user_id = auth.uid()
    )
  );

grant select on public.usability_reports to authenticated;
grant select on public.usability_report_sources to authenticated;
grant select on public.usability_report_frames to authenticated;
