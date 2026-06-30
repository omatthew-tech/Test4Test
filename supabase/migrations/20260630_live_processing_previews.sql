alter table public.test_response_recording_uploads
  add column if not exists thumbnail_storage_bucket text,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_content_type text,
  add column if not exists thumbnail_size_bytes bigint,
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer;

alter table public.test_responses
  add column if not exists recording_thumbnail_bucket text,
  add column if not exists recording_thumbnail_path text,
  add column if not exists recording_thumbnail_content_type text,
  add column if not exists recording_thumbnail_size_bytes bigint,
  add column if not exists recording_thumbnail_width integer,
  add column if not exists recording_thumbnail_height integer;

alter table public.usability_report_sources
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_content_type text,
  add column if not exists thumbnail_size_bytes bigint,
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer;

create index if not exists test_response_recording_uploads_thumbnail_idx
  on public.test_response_recording_uploads (storage_bucket, object_key)
  where thumbnail_path is not null;

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
    return new;
  end if;

  select
    uploads.thumbnail_storage_bucket,
    uploads.thumbnail_path,
    uploads.thumbnail_content_type,
    uploads.thumbnail_size_bytes,
    uploads.thumbnail_width,
    uploads.thumbnail_height
  into v_upload
  from public.test_response_recording_uploads uploads
  where uploads.storage_bucket = new.recording_bucket
    and uploads.object_key = new.recording_path
  limit 1;

  if found and v_upload.thumbnail_path is not null then
    new.recording_thumbnail_bucket := v_upload.thumbnail_storage_bucket;
    new.recording_thumbnail_path := v_upload.thumbnail_path;
    new.recording_thumbnail_content_type := v_upload.thumbnail_content_type;
    new.recording_thumbnail_size_bytes := v_upload.thumbnail_size_bytes;
    new.recording_thumbnail_width := v_upload.thumbnail_width;
    new.recording_thumbnail_height := v_upload.thumbnail_height;
  else
    new.recording_thumbnail_bucket := null;
    new.recording_thumbnail_path := null;
    new.recording_thumbnail_content_type := null;
    new.recording_thumbnail_size_bytes := null;
    new.recording_thumbnail_width := null;
    new.recording_thumbnail_height := null;
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

update public.test_responses responses
set
  recording_thumbnail_bucket = uploads.thumbnail_storage_bucket,
  recording_thumbnail_path = uploads.thumbnail_path,
  recording_thumbnail_content_type = uploads.thumbnail_content_type,
  recording_thumbnail_size_bytes = uploads.thumbnail_size_bytes,
  recording_thumbnail_width = uploads.thumbnail_width,
  recording_thumbnail_height = uploads.thumbnail_height
from public.test_response_recording_uploads uploads
where responses.recording_bucket = uploads.storage_bucket
  and responses.recording_path = uploads.object_key
  and uploads.thumbnail_path is not null;
