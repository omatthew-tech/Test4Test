alter table public.submissions
  add column if not exists instruction_steps text[] not null default '{}'::text[];

update public.submissions
set instruction_steps = array[trim(instructions)]
where cardinality(instruction_steps) = 0
  and length(trim(coalesce(instructions, ''))) > 0;

alter table public.submissions
  drop constraint if exists submissions_instruction_steps_maximum;

alter table public.submissions
  add constraint submissions_instruction_steps_maximum
  check (cardinality(instruction_steps) <= 5);

create or replace function public.create_recording_submission(
  p_product_name text,
  p_description text,
  p_instruction_steps text[],
  p_access_links jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_product_types text[] := array['website']::text[];
  v_instruction_steps text[];
  v_access_links jsonb := '{}'::jsonb;
  v_website_url text;
  v_link_url text;
  v_other_label text;
  v_other_url text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a submission.';
  end if;

  if not public.current_user_has_app_access() then
    raise exception 'Your account cannot access Test4Test right now.';
  end if;

  if length(trim(coalesce(p_product_name, ''))) = 0 then
    raise exception 'Add an app name before creating the submission.';
  end if;

  if cardinality(coalesce(p_instruction_steps, '{}'::text[])) < 1
     or cardinality(coalesce(p_instruction_steps, '{}'::text[])) > 5 then
    raise exception 'Add between 1 and 5 tester instruction steps.';
  end if;

  if exists (
    select 1
    from unnest(p_instruction_steps) as instruction_step
    where nullif(trim(coalesce(instruction_step, '')), '') is null
  ) then
    raise exception 'Each tester instruction step must include a task.';
  end if;

  select array_agg(trim(instruction_step) order by position)
  into v_instruction_steps
  from unnest(p_instruction_steps) with ordinality as steps(instruction_step, position);

  if p_access_links is null or jsonb_typeof(p_access_links) <> 'object' then
    raise exception 'Provide app links as a JSON object.';
  end if;

  v_website_url := nullif(trim(coalesce(p_access_links ->> 'website', '')), '');

  if v_website_url is null then
    raise exception 'Add a public website link for testers.';
  end if;

  if v_website_url !~* '^(https?://)?[[:alnum:]]([[:alnum:]-]*[[:alnum:]])?(\.[[:alnum:]]([[:alnum:]-]*[[:alnum:]])?)+(:[0-9]+)?([/?#][^[:space:]]*)?$'
     or v_website_url ~* '^(https?://)?[^/?#[:space:]]*\.local([:/?#]|$)'
     or v_website_url ~* '^(https?://)?127(\.[0-9]{1,3}){3}(:[0-9]+)?([/?#]|$)' then
    raise exception 'Add a public website domain or http/https URL for testers.';
  end if;

  v_access_links := jsonb_build_object('website', v_website_url);

  v_link_url := nullif(trim(coalesce(p_access_links ->> 'ios', '')), '');
  if v_link_url is not null then
    v_access_links := v_access_links || jsonb_build_object('ios', v_link_url);
    v_product_types := array_append(v_product_types, 'ios');
  end if;

  v_link_url := nullif(trim(coalesce(p_access_links ->> 'android', '')), '');
  if v_link_url is not null then
    v_access_links := v_access_links || jsonb_build_object('android', v_link_url);
    v_product_types := array_append(v_product_types, 'android');
  end if;

  v_link_url := nullif(trim(coalesce(p_access_links ->> 'figma', '')), '');
  if v_link_url is not null then
    v_access_links := v_access_links || jsonb_build_object('figma', v_link_url);
  end if;

  if p_access_links ? 'other' then
    if jsonb_typeof(p_access_links -> 'other') <> 'object' then
      raise exception 'The Other link needs a label and URL.';
    end if;

    v_other_label := nullif(trim(coalesce(p_access_links #>> '{other,label}', '')), '');
    v_other_url := nullif(trim(coalesce(p_access_links #>> '{other,url}', '')), '');

    if v_other_label is null or v_other_url is null then
      raise exception 'The Other link needs a label and URL.';
    end if;

    v_access_links := v_access_links || jsonb_build_object(
      'other',
      jsonb_build_object('label', v_other_label, 'url', v_other_url)
    );
  end if;

  insert into public.submissions (
    user_id,
    product_name,
    product_type,
    product_types,
    description,
    target_audience,
    instructions,
    instruction_steps,
    google_play_closed_test_instructions,
    access_url,
    access_method,
    access_links,
    requires_recording,
    needs_google_play_closed_testers,
    status,
    question_mode,
    is_open_for_more_tests,
    estimated_minutes
  ) values (
    v_user_id,
    trim(p_product_name),
    'website',
    v_product_types,
    coalesce(p_description, ''),
    '',
    array_to_string(v_instruction_steps, E'\n'),
    v_instruction_steps,
    '',
    v_website_url,
    '',
    v_access_links,
    true,
    false,
    'live',
    'general',
    true,
    7
  )
  returning id into v_submission_id;

  insert into public.submission_versions (
    submission_id,
    version_number,
    title,
    description,
    is_active
  ) values (
    v_submission_id,
    1,
    'Version 1',
    null,
    true
  );

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
    'general',
    '[]'::jsonb
  );

  return v_submission_id;
end;
$$;

revoke all on function public.create_recording_submission(text, text, text[], jsonb)
  from public, anon;
grant execute on function public.create_recording_submission(text, text, text[], jsonb)
  to authenticated;
