alter table public.submissions
  add column if not exists promoted boolean;

update public.submissions
set promoted = false
where promoted is null;

alter table public.submissions
  alter column promoted set default false,
  alter column promoted set not null;
