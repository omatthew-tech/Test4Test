alter table public.submissions
  add column if not exists product_types text[];

update public.submissions
set product_types = coalesce(
  case
    when product_types is not null and cardinality(product_types) > 0 then product_types
    when product_type is not null then array[product_type]
    else null
  end,
  array['website']::text[]
);

alter table public.submissions
  alter column product_types set default array['website']::text[],
  alter column product_types set not null;

alter table public.submissions
  drop constraint if exists submissions_product_types_valid;

alter table public.submissions
  add constraint submissions_product_types_valid
  check (
    cardinality(product_types) >= 1
    and product_types <@ array['website', 'ios', 'android']::text[]
  );

drop function if exists public.create_submission_with_questions(text, text, text, text, text, text, text, text, jsonb, integer);

create or replace function public.create_submission_with_questions(
  p_product_name text,
  p_product_types text[],
  p_description text,
  p_target_audience text,
  p_instructions text,
  p_access_url text,
  p_access_method text,
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
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a submission.';
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
    status,
    question_mode,
    is_open_for_more_tests,
    estimated_minutes
  ) values (
    v_user_id,
    trim(p_product_name),
    v_product_types[1],
    v_product_types,
    coalesce(p_description, ''),
    coalesce(p_target_audience, ''),
    coalesce(p_instructions, ''),
    trim(p_access_url),
    coalesce(p_access_method, ''),
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

grant execute on function public.create_submission_with_questions(text, text[], text, text, text, text, text, text, jsonb, integer) to authenticated;
