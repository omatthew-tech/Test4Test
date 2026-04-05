alter table public.profiles
  add column if not exists paypal_handle text,
  add column if not exists venmo_handle text,
  add column if not exists cash_app_handle text;

update public.profiles
set
  paypal_handle = nullif(trim(paypal_handle), ''),
  venmo_handle = nullif(trim(venmo_handle), ''),
  cash_app_handle = nullif(trim(cash_app_handle), '');

alter table public.profiles
  drop constraint if exists profiles_paypal_handle_length,
  drop constraint if exists profiles_venmo_handle_length,
  drop constraint if exists profiles_cash_app_handle_length;

alter table public.profiles
  add constraint profiles_paypal_handle_length
    check (paypal_handle is null or char_length(paypal_handle) <= 120),
  add constraint profiles_venmo_handle_length
    check (venmo_handle is null or char_length(venmo_handle) <= 120),
  add constraint profiles_cash_app_handle_length
    check (cash_app_handle is null or char_length(cash_app_handle) <= 120);
