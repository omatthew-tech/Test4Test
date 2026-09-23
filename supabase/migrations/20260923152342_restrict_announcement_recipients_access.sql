-- This address book is used only by internal announcement operations.
-- Browser roles must not enumerate profile email addresses through a view.
revoke all on public.announcement_recipients from public, anon, authenticated;
grant select on public.announcement_recipients to service_role;
alter view public.announcement_recipients set (security_invoker = true);
