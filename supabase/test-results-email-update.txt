alter table public.test_responses
  add column if not exists owner_notified_at timestamptz;