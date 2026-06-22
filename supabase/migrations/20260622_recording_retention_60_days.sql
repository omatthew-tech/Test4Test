create or replace function public.apply_test_response_recording_retention()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uploaded_at timestamptz := coalesce(new.recording_uploaded_at, new.submitted_at, timezone('utc', now()));
begin
  if new.recording_bucket is not null
    and new.recording_path is not null
    and new.recording_deleted_at is null
  then
    new.recording_expires_at := v_uploaded_at + interval '60 days';
  end if;

  return new;
end;
$$;

drop trigger if exists test_response_recording_retention_before_save on public.test_responses;

create trigger test_response_recording_retention_before_save
before insert or update of
  recording_bucket,
  recording_path,
  recording_uploaded_at,
  recording_expires_at,
  recording_deleted_at
on public.test_responses
for each row
execute function public.apply_test_response_recording_retention();

update public.test_responses
set recording_expires_at = coalesce(recording_uploaded_at, submitted_at, timezone('utc', now())) + interval '60 days'
where recording_bucket is not null
  and recording_path is not null
  and recording_deleted_at is null
  and (
    recording_expires_at is null
    or recording_expires_at < coalesce(recording_uploaded_at, submitted_at, timezone('utc', now())) + interval '60 days'
  );

update public.test_response_recording_uploads
set expires_at = coalesce(uploaded_at, updated_at, created_at, timezone('utc', now())) + interval '60 days',
    updated_at = timezone('utc', now())
where storage_provider = 'r2'
  and status = 'completed'
  and (
    expires_at is null
    or expires_at < coalesce(uploaded_at, updated_at, created_at, timezone('utc', now())) + interval '60 days'
  );
