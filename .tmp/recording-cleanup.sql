
-- Storage cleanup survives cascading account and response deletion.
create table public.recording_version_deletions (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique(bucket, path)
);
alter table public.recording_version_deletions enable row level security;
revoke all on public.recording_version_deletions from public, anon, authenticated;
grant all on public.recording_version_deletions to service_role;

update public.test_response_versions v set thumbnail_bucket = r.recording_thumbnail_bucket,
  thumbnail_path = r.recording_thumbnail_path from public.test_responses r where v.response_id = r.id;

create function private.sync_version_thumbnail() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.test_response_versions set thumbnail_bucket = new.thumbnail_storage_bucket,
    thumbnail_path = new.thumbnail_path
  where recording_bucket = new.storage_bucket and recording_path = new.object_key;
  return new;
end;
$$;
revoke all on function private.sync_version_thumbnail() from public, anon, authenticated;
create trigger sync_version_thumbnail after update of thumbnail_path, attached_response_id
on public.test_response_recording_uploads for each row execute function private.sync_version_thumbnail();

create function private.queue_version_media_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.recording_deleted_at is not null then
    if old.recording_bucket is not null and old.recording_path is not null then
      insert into public.recording_version_deletions(bucket,path) values(old.recording_bucket,old.recording_path)
      on conflict do nothing;
    end if;
    if old.thumbnail_bucket is not null and old.thumbnail_path is not null then
      insert into public.recording_version_deletions(bucket,path) values(old.thumbnail_bucket,old.thumbnail_path)
      on conflict do nothing;
    end if;
  end if;
  return old;
end;
$$;
revoke all on function private.queue_version_media_deletion() from public, anon, authenticated;
create trigger queue_version_media_deletion after delete or update of recording_deleted_at
on public.test_response_versions for each row execute function private.queue_version_media_deletion();
