drop policy if exists "profiles_select_app_users" on public.profiles;

create policy "profiles_select_app_users"
  on public.profiles for select
  using (
    auth.uid() is not null
    and public.current_user_has_app_access()
    and ban_status = 'clear'
  );
