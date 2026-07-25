alter table public.usability_reports
  add column if not exists report_name text;

update public.usability_reports
set report_name = 'Report ' || report_number::text
where nullif(trim(report_name), '') is null;

alter table public.usability_reports
  drop constraint if exists usability_reports_report_name_length_check;

alter table public.usability_reports
  add constraint usability_reports_report_name_length_check
  check (
    report_name is null
    or (
      char_length(trim(report_name)) between 1 and 100
      and report_name = trim(report_name)
    )
  );

comment on column public.usability_reports.report_name is
  'Owner-editable display name. Legacy null values fall back to Report {report_number}.';

notify pgrst, 'reload schema';
