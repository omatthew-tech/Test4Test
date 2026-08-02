-- Shared-report recipients can use the same quote-selection controls as the owner.
-- Other report mutations are authorized by Edge Functions with the service role.

drop policy if exists "usability_report_quotes_select_own" on public.usability_report_quotes;
drop policy if exists "usability_report_quotes_select_own_or_shared" on public.usability_report_quotes;
create policy "usability_report_quotes_select_own_or_shared"
  on public.usability_report_quotes for select
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quotes.report_id
        and reports.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.usability_report_shares shares
      where shares.report_id = usability_report_quotes.report_id
        and shares.recipient_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and shares.status in ('sent', 'opened')
    )
  );

drop policy if exists "usability_report_quotes_update_summary_inclusion" on public.usability_report_quotes;
create policy "usability_report_quotes_update_summary_inclusion"
  on public.usability_report_quotes for update
  using (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quotes.report_id
        and reports.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.usability_report_shares shares
      where shares.report_id = usability_report_quotes.report_id
        and shares.recipient_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and shares.status in ('sent', 'opened')
    )
  )
  with check (
    exists (
      select 1
      from public.usability_reports reports
      where reports.id = usability_report_quotes.report_id
        and reports.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.usability_report_shares shares
      where shares.report_id = usability_report_quotes.report_id
        and shares.recipient_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and shares.status in ('sent', 'opened')
    )
  );

notify pgrst, 'reload schema';
