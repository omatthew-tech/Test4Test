-- New orders use $4.99; existing orders keep their original price for retries and settlement.
create or replace function public.begin_credit_purchase(p_id uuid, p_user_id uuid, p_pack_id text, p_livemode boolean)
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
    ('credits_1',1,499),('credits_3',3,1399),('credits_5',5,1999)
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
