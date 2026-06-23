alter table public.test_response_recording_uploads
  drop constraint if exists test_response_recording_uploads_file_size_bytes_check;

alter table public.test_response_recording_uploads
  add constraint test_response_recording_uploads_file_size_bytes_check
  check (file_size_bytes >= 0 and file_size_bytes <= 1073741824);

update storage.buckets
set file_size_limit = 1073741824
where id = 'test-response-recordings';
