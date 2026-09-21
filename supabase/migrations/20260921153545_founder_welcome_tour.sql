-- Existing founders are intentionally not enrolled. Initialize the presentation
-- preference in the same transaction as the first founder signup.
create or replace function public.complete_founder_signup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
begin
  if v_user_id is null then
    raise exception 'Verify your email before completing founder signup.';
  end if;

  select account_type into v_account_type
  from public.profiles
  where id = v_user_id
  for update;

  if v_account_type = 'tester' then
    raise exception 'That email already belongs to a tester account.';
  end if;

  if v_account_type = 'pending' then
    perform set_config('app.account_type_transition', 'founder', true);
    update public.profiles
    set account_type = 'founder'
    where id = v_user_id;

    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('founder_welcome_v1', 'pending')
    where id = v_user_id
      and coalesce(raw_user_meta_data ->> 'founder_welcome_v1', '')
        not in ('completed', 'dismissed');
  end if;

  return jsonb_build_object('accountType', 'founder');
end;
$$;

revoke all on function public.complete_founder_signup() from public, anon;
grant execute on function public.complete_founder_signup() to authenticated;
