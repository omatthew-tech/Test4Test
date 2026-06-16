alter table public.submissions
  add column if not exists public_share_slug text,
  add column if not exists public_share_message text;

alter table public.submissions
  drop constraint if exists submissions_public_share_slug_format;

alter table public.submissions
  add constraint submissions_public_share_slug_format
  check (
    public_share_slug is null
    or public_share_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  );

create unique index if not exists submissions_public_share_slug_key
  on public.submissions (public_share_slug)
  where public_share_slug is not null;

create or replace function public.normalize_public_share_slug(p_value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(
        both '-' from left(
          regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '-', 'g'),
          80
        )
      ),
      ''
    ),
    'test'
  );
$$;

drop function if exists public.upsert_submission_share_link(uuid, text);
create or replace function public.upsert_submission_share_link(
  p_submission_id uuid,
  p_custom_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.submissions%rowtype;
  v_base_slug text;
  v_candidate_slug text;
  v_suffix integer := 1;
  v_message text := nullif(trim(coalesce(p_custom_message, '')), '');
begin
  if v_user_id is null then
    raise exception 'Please sign in before sharing this test.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  select *
  into v_submission
  from public.submissions submissions
  where submissions.id = p_submission_id
  for update;

  if not found then
    raise exception 'That test could not be found.';
  end if;

  if v_submission.user_id <> v_user_id then
    raise exception 'You can only share your own tests.';
  end if;

  if v_submission.status <> 'live' then
    raise exception 'Only live tests can be shared.';
  end if;

  if v_submission.public_share_slug is not null then
    update public.submissions
    set public_share_message = v_message
    where id = p_submission_id;

    return jsonb_build_object(
      'slug', v_submission.public_share_slug,
      'message', v_message
    );
  end if;

  v_base_slug := public.normalize_public_share_slug(v_submission.product_name);

  loop
    v_candidate_slug := case
      when v_suffix = 1 then v_base_slug
      else v_base_slug || '-' || v_suffix::text
    end;

    begin
      update public.submissions
      set public_share_slug = v_candidate_slug,
          public_share_message = v_message
      where id = p_submission_id;

      return jsonb_build_object(
        'slug', v_candidate_slug,
        'message', v_message
      );
    exception
      when unique_violation then
        v_suffix := v_suffix + 1;
    end;
  end loop;
end;
$$;

grant execute on function public.upsert_submission_share_link(uuid, text) to authenticated;
