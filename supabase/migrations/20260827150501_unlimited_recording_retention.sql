-- Finalized recordings are retained until explicit owner or account deletion.
-- NULL is the canonical no-expiry value for recording and attached-upload rows.

alter table public.test_responses
  alter column recording_expires_at drop not null;

alter table public.test_response_recording_uploads
  alter column expires_at drop not null;

create or replace function public.apply_test_response_recording_retention()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recording_bucket is not null
    and new.recording_path is not null
  then
    new.recording_expires_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.apply_test_response_recording_retention()
  from public, anon, authenticated;

create or replace function public.apply_attached_recording_upload_retention()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed'
    and new.attached_response_id is not null
  then
    new.expires_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.apply_attached_recording_upload_retention()
  from public, anon, authenticated;

drop trigger if exists attached_recording_upload_retention_before_save
  on public.test_response_recording_uploads;

create trigger attached_recording_upload_retention_before_save
before insert or update of attached_response_id, status, expires_at
on public.test_response_recording_uploads
for each row
execute function public.apply_attached_recording_upload_retention();

update public.test_responses
set recording_expires_at = null
where recording_bucket is not null
  and recording_path is not null
  and recording_deleted_at is null
  and recording_expires_at is not null;

update public.test_response_recording_uploads
set expires_at = null,
    updated_at = timezone('utc', now())
where status = 'completed'
  and attached_response_id is not null
  and expires_at is not null;

comment on column public.test_responses.recording_expires_at is
  'NULL for finalized recordings retained until explicit deletion.';

comment on column public.test_response_recording_uploads.expires_at is
  'NULL for uploads attached to finalized recordings; abandoned drafts are cleaned by updated_at.';
