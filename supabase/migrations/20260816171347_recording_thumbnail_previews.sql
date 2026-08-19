-- Recording preview metadata is deliberately duplicated onto the response row.
-- It keeps the owner-facing preview query compact while the upload row remains
-- the source of truth for worker retries and idempotency.

alter table public.test_response_recording_uploads
  add column if not exists thumbnail_storage_bucket text,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_content_type text,
  add column if not exists thumbnail_size_bytes bigint,
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer,
  add column if not exists thumbnail_processing_status text not null default 'pending',
  add column if not exists thumbnail_attempt_count integer not null default 0,
  add column if not exists thumbnail_last_attempt_at timestamptz,
  add column if not exists thumbnail_error text,
  add column if not exists thumbnail_timestamp_ms bigint,
  add column if not exists thumbnail_duration_ms bigint,
  add column if not exists thumbnail_generation_version text;

alter table public.test_response_recording_uploads
  drop constraint if exists test_response_recording_uploads_thumbnail_status_check,
  add constraint test_response_recording_uploads_thumbnail_status_check
    check (thumbnail_processing_status in ('pending', 'queued', 'processing', 'ready', 'failed')),
  drop constraint if exists test_response_recording_uploads_thumbnail_attempt_count_check,
  add constraint test_response_recording_uploads_thumbnail_attempt_count_check
    check (thumbnail_attempt_count >= 0),
  drop constraint if exists test_response_recording_uploads_thumbnail_timing_check,
  add constraint test_response_recording_uploads_thumbnail_timing_check
    check (
      thumbnail_timestamp_ms is null
      or (
        thumbnail_timestamp_ms >= 0
        and thumbnail_duration_ms is not null
        and thumbnail_duration_ms > 0
        and thumbnail_timestamp_ms <= thumbnail_duration_ms
      )
    );

alter table public.test_responses
  add column if not exists recording_thumbnail_bucket text,
  add column if not exists recording_thumbnail_path text,
  add column if not exists recording_thumbnail_content_type text,
  add column if not exists recording_thumbnail_size_bytes bigint,
  add column if not exists recording_thumbnail_width integer,
  add column if not exists recording_thumbnail_height integer,
  add column if not exists recording_thumbnail_status text,
  add column if not exists recording_thumbnail_attempt_count integer,
  add column if not exists recording_thumbnail_last_attempt_at timestamptz,
  add column if not exists recording_thumbnail_error text,
  add column if not exists recording_thumbnail_timestamp_ms bigint,
  add column if not exists recording_thumbnail_duration_ms bigint,
  add column if not exists recording_thumbnail_generation_version text;

alter table public.test_responses
  drop constraint if exists test_responses_recording_thumbnail_status_check,
  add constraint test_responses_recording_thumbnail_status_check
    check (
      recording_thumbnail_status is null
      or recording_thumbnail_status in ('pending', 'queued', 'processing', 'ready', 'failed')
    ),
  drop constraint if exists test_responses_recording_thumbnail_attempt_count_check,
  add constraint test_responses_recording_thumbnail_attempt_count_check
    check (recording_thumbnail_attempt_count is null or recording_thumbnail_attempt_count >= 0),
  drop constraint if exists test_responses_recording_thumbnail_timing_check,
  add constraint test_responses_recording_thumbnail_timing_check
    check (
      recording_thumbnail_timestamp_ms is null
      or (
        recording_thumbnail_timestamp_ms >= 0
        and recording_thumbnail_duration_ms is not null
        and recording_thumbnail_duration_ms > 0
        and recording_thumbnail_timestamp_ms <= recording_thumbnail_duration_ms
      )
    );

-- Keep Group3 report-source columns intact for existing reports. The new
-- recording-thumbnails/ objects are never written into report sources.
alter table if exists public.usability_report_sources
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_content_type text,
  add column if not exists thumbnail_size_bytes bigint,
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer;

create index if not exists test_response_recording_uploads_thumbnail_idx
  on public.test_response_recording_uploads (storage_bucket, object_key)
  where thumbnail_path is not null;

create index if not exists test_response_recording_uploads_thumbnail_queue_idx
  on public.test_response_recording_uploads (
    thumbnail_processing_status,
    thumbnail_last_attempt_at,
    created_at
  )
  where status = 'completed' and attached_response_id is not null;

create or replace function public.apply_test_response_recording_thumbnail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload record;
begin
  if new.recording_bucket is null or new.recording_path is null then
    new.recording_thumbnail_bucket := null;
    new.recording_thumbnail_path := null;
    new.recording_thumbnail_content_type := null;
    new.recording_thumbnail_size_bytes := null;
    new.recording_thumbnail_width := null;
    new.recording_thumbnail_height := null;
    new.recording_thumbnail_status := null;
    new.recording_thumbnail_attempt_count := null;
    new.recording_thumbnail_last_attempt_at := null;
    new.recording_thumbnail_error := null;
    new.recording_thumbnail_timestamp_ms := null;
    new.recording_thumbnail_duration_ms := null;
    new.recording_thumbnail_generation_version := null;
    return new;
  end if;

  select
    uploads.thumbnail_storage_bucket,
    uploads.thumbnail_path,
    uploads.thumbnail_content_type,
    uploads.thumbnail_size_bytes,
    uploads.thumbnail_width,
    uploads.thumbnail_height,
    uploads.thumbnail_processing_status,
    uploads.thumbnail_attempt_count,
    uploads.thumbnail_last_attempt_at,
    uploads.thumbnail_error,
    uploads.thumbnail_timestamp_ms,
    uploads.thumbnail_duration_ms,
    uploads.thumbnail_generation_version
  into v_upload
  from public.test_response_recording_uploads uploads
  where uploads.storage_bucket = new.recording_bucket
    and uploads.object_key = new.recording_path
  limit 1;

  if found then
    new.recording_thumbnail_bucket := v_upload.thumbnail_storage_bucket;
    new.recording_thumbnail_path := v_upload.thumbnail_path;
    new.recording_thumbnail_content_type := v_upload.thumbnail_content_type;
    new.recording_thumbnail_size_bytes := v_upload.thumbnail_size_bytes;
    new.recording_thumbnail_width := v_upload.thumbnail_width;
    new.recording_thumbnail_height := v_upload.thumbnail_height;
    new.recording_thumbnail_status := v_upload.thumbnail_processing_status;
    new.recording_thumbnail_attempt_count := v_upload.thumbnail_attempt_count;
    new.recording_thumbnail_last_attempt_at := v_upload.thumbnail_last_attempt_at;
    new.recording_thumbnail_error := v_upload.thumbnail_error;
    new.recording_thumbnail_timestamp_ms := v_upload.thumbnail_timestamp_ms;
    new.recording_thumbnail_duration_ms := v_upload.thumbnail_duration_ms;
    new.recording_thumbnail_generation_version := v_upload.thumbnail_generation_version;
  else
    new.recording_thumbnail_bucket := null;
    new.recording_thumbnail_path := null;
    new.recording_thumbnail_content_type := null;
    new.recording_thumbnail_size_bytes := null;
    new.recording_thumbnail_width := null;
    new.recording_thumbnail_height := null;
    new.recording_thumbnail_status := 'pending';
    new.recording_thumbnail_attempt_count := 0;
    new.recording_thumbnail_last_attempt_at := null;
    new.recording_thumbnail_error := null;
    new.recording_thumbnail_timestamp_ms := null;
    new.recording_thumbnail_duration_ms := null;
    new.recording_thumbnail_generation_version := null;
  end if;

  return new;
end;
$$;

drop trigger if exists test_responses_recording_thumbnail_before_save on public.test_responses;
create trigger test_responses_recording_thumbnail_before_save
  before insert or update of recording_bucket, recording_path
  on public.test_responses
  for each row
  execute function public.apply_test_response_recording_thumbnail();

update public.test_response_recording_uploads
set
  thumbnail_processing_status = case
    when thumbnail_path is not null then 'pending'
    else coalesce(thumbnail_processing_status, 'pending')
  end,
  thumbnail_error = null,
  thumbnail_timestamp_ms = null,
  thumbnail_duration_ms = null,
  thumbnail_generation_version = null
where status = 'completed'
  and attached_response_id is not null;

update public.test_responses responses
set
  recording_thumbnail_bucket = uploads.thumbnail_storage_bucket,
  recording_thumbnail_path = uploads.thumbnail_path,
  recording_thumbnail_content_type = uploads.thumbnail_content_type,
  recording_thumbnail_size_bytes = uploads.thumbnail_size_bytes,
  recording_thumbnail_width = uploads.thumbnail_width,
  recording_thumbnail_height = uploads.thumbnail_height,
  recording_thumbnail_status = uploads.thumbnail_processing_status,
  recording_thumbnail_attempt_count = uploads.thumbnail_attempt_count,
  recording_thumbnail_last_attempt_at = uploads.thumbnail_last_attempt_at,
  recording_thumbnail_error = uploads.thumbnail_error,
  recording_thumbnail_timestamp_ms = uploads.thumbnail_timestamp_ms,
  recording_thumbnail_duration_ms = uploads.thumbnail_duration_ms,
  recording_thumbnail_generation_version = uploads.thumbnail_generation_version
from public.test_response_recording_uploads uploads
where responses.recording_bucket = uploads.storage_bucket
  and responses.recording_path = uploads.object_key;
