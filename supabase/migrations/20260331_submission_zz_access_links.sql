alter table public.submissions
  add column if not exists access_links jsonb;

update public.submissions
set access_links = coalesce(
  case
    when access_links is not null and jsonb_typeof(access_links) = 'object' and access_links <> '{}'::jsonb then access_links
    when nullif(trim(coalesce(access_url, '')), '') is not null and product_type is not null then jsonb_build_object(product_type, trim(access_url))
    else '{}'::jsonb
  end,
  '{}'::jsonb
);

update public.submissions
set access_links = '{}'::jsonb
where access_links is null
   or jsonb_typeof(access_links) <> 'object';

alter table public.submissions
  alter column access_links set default '{}'::jsonb,
  alter column access_links set not null;

alter table public.submissions
  drop constraint if exists submissions_access_links_is_object;

alter table public.submissions
  add constraint submissions_access_links_is_object
  check (jsonb_typeof(access_links) = 'object');

drop function if exists public.create_submission_with_questions(text, text[], text, text, text, text, text, text, jsonb, integer);
drop function if exists public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer);

create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_links jsonb,
  p_question_mode text,
  p_questions jsonb,
  p_estimated_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_product_types text[];
  v_primary_product_type text;
  v_primary_access_url text;
  v_access_links jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a submission.';
  end if;

  if p_access_links is not null and jsonb_typeof(p_access_links) <> 'object' then
    raise exception 'Provide app links as a JSON object keyed by app type.';
  end if;

  select coalesce(
    array_agg(product_type order by array_position(array['website', 'ios', 'android']::text[], product_type)),
    array['website']::text[]
  )
  into v_product_types
  from (
    select distinct unnest(coalesce(p_product_types, array[]::text[])) as product_type
  ) normalized
  where product_type = any (array['website', 'ios', 'android']::text[]);

  if coalesce(cardinality(v_product_types), 0) = 0 then
    raise exception 'Select at least one app type.';
  end if;

  if exists (
    select 1
    from unnest(v_product_types) as product_type
    where nullif(trim(coalesce(p_access_links ->> product_type, '')), '') is null
  ) then
    raise exception 'Add a public link for each selected app type.';
  end if;

  select coalesce(
    jsonb_object_agg(product_type, access_url),
    '{}'::jsonb
  )
  into v_access_links
  from (
    select product_type, trim(p_access_links ->> product_type) as access_url
    from unnest(v_product_types) as product_type
  ) normalized_links;

  v_primary_product_type := v_product_types[1];
  v_primary_access_url := v_access_links ->> v_primary_product_type;

  insert into public.submissions (
    user_id,
    product_name,
    product_type,
    product_types,
    description,
    target_audience,
    instructions,
    access_url,
    access_method,
    access_links,
    status,
    question_mode,
    is_open_for_more_tests,
    estimated_minutes
  ) values (
    v_user_id,
    trim(p_product_name),
    v_primary_product_type,
    v_product_types,
    coalesce(p_description, ''),
    coalesce(p_target_audience, ''),
    coalesce(p_instructions, ''),
    v_primary_access_url,
    '',
    v_access_links,
    'live',
    p_question_mode,
    true,
    greatest(coalesce(p_estimated_minutes, 5), 1)
  )
  returning id into v_submission_id;

  insert into public.question_set_versions (
    submission_id,
    version_number,
    is_active,
    mode,
    questions
  ) values (
    v_submission_id,
    1,
    true,
    p_question_mode,
    p_questions
  );

  return v_submission_id;
end;
$$;

grant execute on function public.create_submission_with_questions(text, text[], text, text, text, jsonb, text, jsonb, integer) to authenticated;
