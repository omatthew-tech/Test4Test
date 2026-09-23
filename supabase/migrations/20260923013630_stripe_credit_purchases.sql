-- Stripe is the payment authority; only the service role may create or settle orders.
create table public.credit_purchase_orders (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack_id text not null check (pack_id in ('credits_1','credits_3','credits_5')),
  credits integer not null check (credits in (1,3,5)),
  amount_subtotal integer not null check (amount_subtotal > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  livemode boolean not null,
  status text not null default 'pending' check (status in ('pending','paid','expired','failed')),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_invoice_id text,
  amount_total integer,
  credits_granted boolean not null default false,
  review_required boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index credit_purchase_orders_user_created on public.credit_purchase_orders(user_id, created_at desc);
alter table public.credit_purchase_orders enable row level security;
create policy credit_purchase_orders_read_own on public.credit_purchase_orders for select
  to authenticated using (user_id = (select auth.uid()));
revoke all on public.credit_purchase_orders from anon, authenticated;
grant select on public.credit_purchase_orders to authenticated;
grant all on public.credit_purchase_orders to service_role;

create table public.stripe_credit_events (
  event_id text primary key,
  order_id uuid not null references public.credit_purchase_orders(id) on delete cascade,
  event_type text not null,
  received_at timestamptz not null default now()
);
create index stripe_credit_events_order on public.stripe_credit_events(order_id);
alter table public.stripe_credit_events enable row level security;
revoke all on public.stripe_credit_events from anon, authenticated;
grant all on public.stripe_credit_events to service_role;

alter table public.credit_transactions drop constraint credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type in ('starter_credit','earned_test','adjustment','revocation','feedback_unlock','purchase'));
alter table public.credit_transactions add column purchase_order_id uuid
  references public.credit_purchase_orders(id) on delete cascade;
create unique index credit_transactions_purchase_unique on public.credit_transactions(purchase_order_id)
  where purchase_order_id is not null;
alter table public.credit_transactions add constraint credit_purchase_positive
  check (type <> 'purchase' or (amount > 0 and purchase_order_id is not null));

create function public.begin_credit_purchase(p_id uuid, p_user_id uuid, p_pack_id text, p_livemode boolean)
returns public.credit_purchase_orders language plpgsql security invoker set search_path = '' as $$
declare v_order public.credit_purchase_orders; v_credits integer; v_amount integer;
begin
  perform 1 from public.profiles where id = p_user_id and ban_status <> 'banned' for update;
  if not found then raise exception 'Account unavailable.' using errcode = '42501'; end if;
  select * into v_order from public.credit_purchase_orders where id = p_id;
  if found then
    if v_order.user_id <> p_user_id or v_order.pack_id <> p_pack_id or v_order.livemode <> p_livemode then
      raise exception 'Purchase request conflicts with an existing order.' using errcode = '22023';
    end if;
    return v_order;
  end if;
  select credits, amount into v_credits, v_amount from (values
    ('credits_1',1,500),('credits_3',3,1399),('credits_5',5,1999)
  ) as packs(id,credits,amount) where id = p_pack_id;
  if v_credits is null then raise exception 'Unknown credit pack.' using errcode = '22023'; end if;
  if (select count(*) from public.credit_purchase_orders where user_id = p_user_id
    and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many checkout attempts. Try again later.' using errcode = '54000';
  end if;
  insert into public.credit_purchase_orders(id,user_id,pack_id,credits,amount_subtotal,livemode)
  values(p_id,p_user_id,p_pack_id,v_credits,v_amount,p_livemode) returning * into v_order;
  return v_order;
end;
$$;

-- Event receipt and credit award commit together. No external API runs inside this transaction.
create function public.apply_credit_purchase_event(p_event_id text, p_event_type text,
  p_order_id uuid, p_livemode boolean, p_action text, p_session_id text default null,
  p_payment_intent_id text default null, p_subtotal integer default null,
  p_total integer default null, p_currency text default null, p_invoice_id text default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_order public.credit_purchase_orders; v_user_id uuid;
begin
  select user_id into v_user_id from public.credit_purchase_orders where id = p_order_id;
  if not found then return 'unknown_order'; end if;
  -- Same lock order as the existing feedback-unlock ledger writer.
  perform 1 from public.profiles where id = v_user_id for update;
  select * into v_order from public.credit_purchase_orders where id = p_order_id for update;
  if v_order.livemode is distinct from p_livemode then raise exception 'Stripe mode mismatch.'; end if;
  if p_action not in ('paid','expired','failed','review','invoice') or p_action is null then
    raise exception 'Unsupported event action.';
  end if;
  if p_session_id is not null and v_order.stripe_session_id is not null
    and v_order.stripe_session_id <> p_session_id then raise exception 'Session mismatch.'; end if;
  if p_payment_intent_id is not null and v_order.stripe_payment_intent_id is not null
    and v_order.stripe_payment_intent_id <> p_payment_intent_id then raise exception 'Payment mismatch.'; end if;
  if p_action = 'paid' and (p_subtotal is distinct from v_order.amount_subtotal
    or p_currency is distinct from v_order.currency or p_total is null or p_total < p_subtotal
    or p_session_id is null or p_payment_intent_id is null) then
    raise exception 'Payment does not match purchased pack.';
  end if;
  insert into public.stripe_credit_events(event_id,order_id,event_type)
    values(p_event_id,p_order_id,p_event_type) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  update public.credit_purchase_orders set
    stripe_session_id = coalesce(stripe_session_id,p_session_id),
    stripe_payment_intent_id = coalesce(stripe_payment_intent_id,p_payment_intent_id),
    stripe_invoice_id = coalesce(p_invoice_id,stripe_invoice_id)
    where id = p_order_id;
  if p_action = 'review' then
    update public.credit_purchase_orders set review_required = true where id = p_order_id;
  elsif p_action = 'paid' then
    if not v_order.credits_granted and not v_order.review_required then
      insert into public.credit_transactions(user_id,type,amount,reason,purchase_order_id)
        values(v_order.user_id,'purchase',v_order.credits,'Stripe feedback credit purchase',p_order_id);
      update public.credit_purchase_orders set credits_granted = true where id = p_order_id;
    end if;
    update public.credit_purchase_orders set status = 'paid', amount_total = p_total,
      paid_at = coalesce(paid_at,now()) where id = p_order_id;
  elsif p_action in ('failed','expired') and v_order.status <> 'paid' then
    update public.credit_purchase_orders set status = p_action where id = p_order_id;
  end if;
  return 'processed';
end;
$$;
revoke all on function public.begin_credit_purchase(uuid,uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.apply_credit_purchase_event(text,text,uuid,boolean,text,text,text,integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.begin_credit_purchase(uuid,uuid,text,boolean) to service_role;
grant execute on function public.apply_credit_purchase_event(text,text,uuid,boolean,text,text,text,integer,integer,text,text) to service_role;
