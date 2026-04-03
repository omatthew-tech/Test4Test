create table if not exists public.test_response_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  test_response_id uuid not null references public.test_responses (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, test_response_id)
);

create index if not exists test_response_favorites_user_created_idx
  on public.test_response_favorites (user_id, created_at desc);

alter table public.test_response_favorites enable row level security;

drop policy if exists "test_response_favorites_select_own" on public.test_response_favorites;
create policy "test_response_favorites_select_own"
  on public.test_response_favorites for select
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = test_response_favorites.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );

drop policy if exists "test_response_favorites_insert_own" on public.test_response_favorites;
create policy "test_response_favorites_insert_own"
  on public.test_response_favorites for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = test_response_favorites.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );

drop policy if exists "test_response_favorites_delete_own" on public.test_response_favorites;
create policy "test_response_favorites_delete_own"
  on public.test_response_favorites for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.test_responses responses
      where responses.id = test_response_favorites.test_response_id
        and responses.tester_user_id = auth.uid()
    )
  );