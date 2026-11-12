-- Additive business-facing invoices, payment ledger, allocations and cheque lifecycle.
-- Does not rewrite historical sales or alter inventory movements.

create table if not exists public.business_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid,
  customer_id uuid not null,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date,
  currency_code text not null default 'KES',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null check (total >= 0),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  notes text,
  status text not null default 'issued' check (status in ('draft','issued','void')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number),
  unique (business_id, id),
  foreign key (business_id, branch_id) references public.branches(business_id,id),
  foreign key (business_id, customer_id) references public.customers(business_id,id)
);

create table if not exists public.business_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid,
  direction text not null check (direction in ('in','out')),
  payment_type text not null default 'general' check (payment_type in ('customer_receipt','supplier_payment','expense_payment','refund','general')),
  customer_id uuid,
  supplier_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'KES',
  payment_method text not null check (payment_method in ('cash','mpesa','card','bank','cheque','other')),
  status text not null default 'confirmed' check (status in ('pending','confirmed','failed','reversed','refunded')),
  payment_date timestamptz not null default now(),
  receipt_number text not null,
  external_reference text,
  account_name text,
  payer_payee text,
  notes text,
  cheque_number text,
  cheque_bank text,
  cheque_date date,
  cheque_deposit_date date,
  cheque_status text check (cheque_status is null or cheque_status in ('received','deposited','cleared','bounced','cancelled')),
  provider text,
  idempotency_key text,
  created_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, receipt_number),
  foreign key (business_id, branch_id) references public.branches(business_id,id),
  foreign key (business_id, customer_id) references public.customers(business_id,id),
  foreign key (business_id, supplier_id) references public.suppliers(business_id,id),
  check ((payment_method = 'cheque' and cheque_number is not null and cheque_status is not null) or payment_method <> 'cheque')
);

create unique index if not exists business_payments_idempotency_unique on public.business_payments(business_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists business_payments_external_reference_unique on public.business_payments(business_id,payment_method,external_reference) where external_reference is not null and payment_method in ('mpesa','bank');
create index if not exists business_invoices_business_date_idx on public.business_invoices(business_id,issue_date desc);
create index if not exists business_invoices_customer_idx on public.business_invoices(business_id,customer_id,due_date);
create index if not exists business_invoices_branch_fk_idx on public.business_invoices(business_id,branch_id);
create index if not exists business_invoices_created_by_idx on public.business_invoices(created_by);
create index if not exists business_payments_business_date_idx on public.business_payments(business_id,payment_date desc);
create index if not exists business_payments_cheque_status_idx on public.business_payments(business_id,cheque_status) where payment_method='cheque';
create index if not exists business_payments_branch_fk_idx on public.business_payments(business_id,branch_id);
create index if not exists business_payments_customer_fk_idx on public.business_payments(business_id,customer_id);
create index if not exists business_payments_supplier_fk_idx on public.business_payments(business_id,supplier_id);
create index if not exists business_payments_created_by_idx on public.business_payments(created_by);
create index if not exists business_payments_verified_by_idx on public.business_payments(verified_by);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  payment_id uuid not null,
  invoice_id uuid,
  purchase_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  foreign key (business_id,payment_id) references public.business_payments(business_id,id) on delete restrict,
  foreign key (business_id,invoice_id) references public.business_invoices(business_id,id) on delete restrict,
  foreign key (business_id,purchase_id) references public.purchases(business_id,id) on delete restrict,
  check ((invoice_id is not null and purchase_id is null) or (invoice_id is null and purchase_id is not null))
);
create index if not exists payment_allocations_invoice_idx on public.payment_allocations(business_id,invoice_id);
create index if not exists payment_allocations_purchase_idx on public.payment_allocations(business_id,purchase_id);
create index if not exists payment_allocations_payment_idx on public.payment_allocations(business_id,payment_id);

create or replace function private.set_business_payment_receipt_number()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.receipt_number is null or btrim(new.receipt_number) = '' then
    new.receipt_number := 'RCT-' || to_char(coalesce(new.payment_date,now()) at time zone 'Africa/Nairobi','YYYYMMDD') || '-' || upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  return new;
end;
$$;
drop trigger if exists business_payment_receipt_number on public.business_payments;
create trigger business_payment_receipt_number before insert on public.business_payments for each row execute function private.set_business_payment_receipt_number();

create or replace function private.confirm_cleared_cheque()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payment_method='cheque' and new.cheque_status='cleared' and old.cheque_status is distinct from new.cheque_status then
    new.status:='confirmed'; new.verified_by:=(select auth.uid());
  elsif new.payment_method='cheque' and new.cheque_status in ('bounced','cancelled') and old.cheque_status is distinct from new.cheque_status then
    new.status:='failed';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists business_payment_cheque_lifecycle on public.business_payments;
create trigger business_payment_cheque_lifecycle before update of cheque_status on public.business_payments for each row execute function private.confirm_cleared_cheque();

alter table public.business_invoices enable row level security;
alter table public.business_payments enable row level security;
alter table public.payment_allocations enable row level security;

drop policy if exists business_invoices_owner_manage on public.business_invoices;
create policy business_invoices_owner_manage on public.business_invoices for all to authenticated using (private.is_platform_admin() or private.is_business_owner(business_id)) with check (private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists business_payments_owner_manage on public.business_payments;
create policy business_payments_owner_manage on public.business_payments for all to authenticated using (private.is_platform_admin() or private.is_business_owner(business_id)) with check (private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists payment_allocations_owner_manage on public.payment_allocations;
create policy payment_allocations_owner_manage on public.payment_allocations for all to authenticated using (private.is_platform_admin() or private.is_business_owner(business_id)) with check (private.is_platform_admin() or private.is_business_owner(business_id));

grant select,insert,update,delete on public.business_invoices to authenticated;
grant select,insert,update,delete on public.business_payments to authenticated;
grant select,insert,update,delete on public.payment_allocations to authenticated;

create or replace function public.record_business_payment(
  p_business_id uuid,p_direction text,p_payment_type text,p_amount numeric,p_payment_method text,
  p_branch_id uuid default null,p_customer_id uuid default null,p_supplier_id uuid default null,
  p_payment_date timestamptz default now(),p_external_reference text default null,p_payer_payee text default null,
  p_notes text default null,p_cheque_number text default null,p_cheque_bank text default null,
  p_cheque_date date default null,p_cheque_deposit_date date default null,p_allocations jsonb default '[]'::jsonb,
  p_idempotency_key text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_payment_id uuid; v_alloc jsonb; v_invoice_id uuid; v_purchase_id uuid;
  v_alloc_amount numeric(14,2); v_alloc_total numeric(14,2):=0; v_doc_total numeric(14,2); v_paid numeric(14,2);
  v_method text:=lower(p_payment_method); v_cheque_status text; v_status text;
begin
  if not (private.is_platform_admin() or private.is_business_owner(p_business_id)) then raise exception 'Only the business owner can record or manage payments.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_direction not in ('in','out') then raise exception 'Choose money received or money paid.'; end if;
  if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'Payment allocations must be a list.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches b where b.business_id=p_business_id and b.id=p_branch_id) then raise exception 'The selected branch does not belong to this business.'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers c where c.business_id=p_business_id and c.id=p_customer_id) then raise exception 'The selected customer does not belong to this business.'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.business_id=p_business_id and s.id=p_supplier_id) then raise exception 'The selected supplier does not belong to this business.'; end if;
  if v_method not in ('cash','mpesa','card','bank','cheque','other') then raise exception 'Unsupported payment method.'; end if;
  if v_method='cheque' and coalesce(nullif(btrim(p_cheque_number),''),'')='' then raise exception 'Enter the cheque number.'; end if;
  v_cheque_status:=case when v_method='cheque' then 'received' else null end;
  v_status:=case when v_method='cheque' then 'pending' else 'confirmed' end;

  insert into public.business_payments(business_id,branch_id,direction,payment_type,customer_id,supplier_id,amount,payment_method,status,payment_date,receipt_number,external_reference,payer_payee,notes,cheque_number,cheque_bank,cheque_date,cheque_deposit_date,cheque_status,provider,idempotency_key,created_by)
  values(p_business_id,p_branch_id,p_direction,coalesce(p_payment_type,'general'),p_customer_id,p_supplier_id,p_amount,v_method,v_status,coalesce(p_payment_date,now()),'',nullif(btrim(p_external_reference),''),nullif(btrim(p_payer_payee),''),nullif(btrim(p_notes),''),nullif(btrim(p_cheque_number),''),nullif(btrim(p_cheque_bank),''),p_cheque_date,p_cheque_deposit_date,v_cheque_status,case when v_method='mpesa' then 'M-Pesa' else null end,p_idempotency_key,(select auth.uid()))
  returning id into v_payment_id;

  for v_alloc in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_invoice_id:=nullif(v_alloc->>'invoice_id','')::uuid;
    v_purchase_id:=nullif(v_alloc->>'purchase_id','')::uuid;
    v_alloc_amount:=(v_alloc->>'amount')::numeric;
    if v_alloc_amount is null or v_alloc_amount<=0 then raise exception 'Each allocated amount must be greater than zero.'; end if;
    if (v_invoice_id is not null and v_purchase_id is not null) or (v_invoice_id is null and v_purchase_id is null) then raise exception 'Each allocation must refer to exactly one invoice or supplier purchase.'; end if;
    if v_invoice_id is not null then
      if p_direction<>'in' then raise exception 'Customer invoices can only receive incoming payments.'; end if;
      select total into v_doc_total from public.business_invoices where business_id=p_business_id and id=v_invoice_id and status='issued' for update;
      if not found then raise exception 'Invoice not found or not available for payment.'; end if;
      select coalesce(sum(pa.amount),0) into v_paid from public.payment_allocations pa join public.business_payments bp on bp.business_id=pa.business_id and bp.id=pa.payment_id where pa.business_id=p_business_id and pa.invoice_id=v_invoice_id and bp.status='confirmed';
      if v_paid+v_alloc_amount>v_doc_total+0.005 then raise exception 'This payment is more than the invoice balance.'; end if;
    else
      if p_direction<>'out' then raise exception 'Supplier purchases can only receive outgoing payments.'; end if;
      select total into v_doc_total from public.purchases where business_id=p_business_id and id=v_purchase_id and status='received' for update;
      if not found then raise exception 'Supplier purchase not found or not available for payment.'; end if;
      if p_supplier_id is not null and not exists(select 1 from public.purchases where business_id=p_business_id and id=v_purchase_id and supplier_id=p_supplier_id) then raise exception 'The selected purchase does not belong to this supplier.'; end if;
      select coalesce(sum(pa.amount),0) into v_paid from public.payment_allocations pa join public.business_payments bp on bp.business_id=pa.business_id and bp.id=pa.payment_id where pa.business_id=p_business_id and pa.purchase_id=v_purchase_id and bp.status='confirmed';
      if v_paid+v_alloc_amount>v_doc_total+0.005 then raise exception 'This payment is more than the supplier balance.'; end if;
    end if;
    v_alloc_total:=v_alloc_total+v_alloc_amount;
    insert into public.payment_allocations(business_id,payment_id,invoice_id,purchase_id,amount) values(p_business_id,v_payment_id,v_invoice_id,v_purchase_id,v_alloc_amount);
  end loop;
  if v_alloc_total>p_amount+0.005 then raise exception 'Allocated amounts cannot exceed the payment amount.'; end if;
  return v_payment_id;
end;
$$;
revoke all on function public.record_business_payment(uuid,text,text,numeric,text,uuid,uuid,uuid,timestamptz,text,text,text,text,text,date,date,jsonb,text) from public,anon;
grant execute on function public.record_business_payment(uuid,text,text,numeric,text,uuid,uuid,uuid,timestamptz,text,text,text,text,text,date,date,jsonb,text) to authenticated;
