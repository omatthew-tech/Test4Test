create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  visitor_id text not null,
  session_id text not null,
  user_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_visitor_created_idx
  on public.analytics_events (visitor_id, created_at desc);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

alter table public.analytics_events enable row level security;

drop policy if exists "analytics_events_no_client_select" on public.analytics_events;
create policy "analytics_events_no_client_select"
  on public.analytics_events for select
  using (false);

drop policy if exists "analytics_events_no_client_insert" on public.analytics_events;
create policy "analytics_events_no_client_insert"
  on public.analytics_events for insert
  with check (false);

grant usage on schema public to anon, authenticated;
grant insert on public.analytics_events to service_role;
grant select on public.analytics_events to service_role;
