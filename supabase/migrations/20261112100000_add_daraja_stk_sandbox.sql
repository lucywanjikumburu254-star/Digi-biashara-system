create table if not exists public.daraja_stk_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.business_invoices(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'KES',
  phone_number text not null,
  account_reference text not null,
  merchant_request_id text,
  checkout_request_id text unique,
  callback_token_hash text not null unique,
  response_code text,
  response_description text,
  result_code integer,
  result_description text,
  mpesa_receipt_number text,
  transaction_date timestamptz,
  payment_id uuid references public.business_payments(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daraja_stk_requests_business_created_idx
  on public.daraja_stk_requests (business_id, created_at desc);
create index if not exists daraja_stk_requests_invoice_pending_idx
  on public.daraja_stk_requests (invoice_id, created_at desc) where status = 'pending';

alter table public.daraja_stk_requests enable row level security;

drop policy if exists "Business owners can view Daraja STK requests" on public.daraja_stk_requests;
create policy "Business owners can view Daraja STK requests"
on public.daraja_stk_requests for select to authenticated
using (private.is_business_owner(business_id) or private.is_platform_admin());

create unique index if not exists business_payments_provider_idempotency_uidx
  on public.business_payments (provider, idempotency_key)
  where provider is not null and idempotency_key is not null;

create unique index if not exists payment_allocations_payment_invoice_uidx
  on public.payment_allocations (payment_id, invoice_id)
  where invoice_id is not null;

create or replace function public.process_daraja_stk_callback(
  p_checkout_request_id text,
  p_callback_token_hash text,
  p_result_code integer,
  p_result_description text,
  p_amount numeric default null,
  p_mpesa_receipt_number text default null,
  p_phone_number text default null,
  p_transaction_date timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.daraja_stk_requests%rowtype;
  v_payment_id uuid;
  v_balance numeric(14,2);
  v_allocate numeric(14,2);
begin
  select * into v_request
  from public.daraja_stk_requests
  where checkout_request_id = p_checkout_request_id
    and callback_token_hash = p_callback_token_hash
  for update;

  if not found then
    raise exception 'Unknown Daraja callback request';
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', v_request.status);
  end if;

  update public.daraja_stk_requests
  set result_code = p_result_code,
      result_description = left(coalesce(p_result_description, ''), 500),
      mpesa_receipt_number = p_mpesa_receipt_number,
      transaction_date = p_transaction_date,
      updated_at = now()
  where id = v_request.id;

  if p_result_code <> 0 then
    update public.daraja_stk_requests
    set status = 'failed', updated_at = now()
    where id = v_request.id;
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;

  if p_amount is null or p_amount <> v_request.amount then
    raise exception 'Daraja callback amount does not match the requested amount';
  end if;
  if nullif(trim(coalesce(p_mpesa_receipt_number, '')), '') is null then
    raise exception 'Successful Daraja callback is missing the M-Pesa receipt number';
  end if;

  select greatest(
    0,
    i.total - coalesce(sum(a.amount) filter (where bp.status = 'confirmed'), 0)
  ) into v_balance
  from public.business_invoices i
  left join public.payment_allocations a on a.invoice_id = i.id
  left join public.business_payments bp on bp.id = a.payment_id
  where i.id = v_request.invoice_id
  group by i.id;

  v_allocate := least(v_request.amount, coalesce(v_balance, 0));

  insert into public.business_payments (
    business_id, branch_id, direction, payment_type, customer_id,
    amount, currency_code, payment_method, status, payment_date,
    external_reference, payer_payee, notes, provider, idempotency_key,
    created_by, verified_by
  ) values (
    v_request.business_id, v_request.branch_id, 'in', 'customer_receipt',
    v_request.customer_id, v_request.amount, 'KES', 'mpesa', 'confirmed',
    coalesce(p_transaction_date, now()), p_mpesa_receipt_number,
    coalesce(p_phone_number, v_request.phone_number),
    'Safaricom Daraja STK Push · ' || v_request.account_reference,
    'daraja', 'daraja-stk-' || p_checkout_request_id,
    v_request.created_by, v_request.created_by
  )
  on conflict (provider, idempotency_key) where provider is not null and idempotency_key is not null
  do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select id into v_payment_id from public.business_payments
    where provider = 'daraja' and idempotency_key = 'daraja-stk-' || p_checkout_request_id;
  end if;

  if v_allocate > 0 then
    insert into public.payment_allocations (business_id, payment_id, invoice_id, amount)
    values (v_request.business_id, v_payment_id, v_request.invoice_id, v_allocate)
    on conflict (payment_id, invoice_id) where invoice_id is not null do nothing;
  end if;

  update public.daraja_stk_requests
  set status = 'confirmed', payment_id = v_payment_id, updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'ok', true, 'status', 'confirmed', 'payment_id', v_payment_id,
    'allocated_amount', v_allocate, 'unallocated_amount', v_request.amount - v_allocate
  );
end;
$$;

revoke all on function public.process_daraja_stk_callback(text,text,integer,text,numeric,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.process_daraja_stk_callback(text,text,integer,text,numeric,text,text,timestamptz) to service_role;

grant select on public.daraja_stk_requests to authenticated;
