alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check check (status = any (array['completed'::text,'void'::text,'pending_payment'::text]));
alter table public.daraja_stk_requests alter column invoice_id drop not null;
alter table public.daraja_stk_requests alter column customer_id drop not null;
alter table public.daraja_stk_requests add column if not exists sale_id uuid references public.sales(id) on delete set null;
create index if not exists daraja_stk_requests_sale_pending_idx on public.daraja_stk_requests(sale_id,created_at desc) where status='pending';

create or replace function public.create_pending_pos_sale(
 p_business_id uuid,p_branch_id uuid,p_items jsonb,p_customer_id uuid default null,
 p_discount numeric default 0,p_tax numeric default 0,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sale_id uuid; v_sale_number text; v_item jsonb; v_product public.products%rowtype;
 v_qty numeric; v_price numeric; v_subtotal numeric:=0; v_total numeric; v_needed numeric; v_available numeric;
begin
 if auth.uid() is null or not private.is_business_member(p_business_id) then raise exception 'Active business membership required.'; end if;
 if not private.business_is_operational(p_business_id) then raise exception 'Business workspace is paused.'; end if;
 if exists(select 1 from public.business_memberships bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='employee' and bm.status='active')
 and not exists(select 1 from public.business_memberships bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='employee' and bm.status='active' and bm.branch_id=p_branch_id and bm.permissions->>'sales'='true') then raise exception 'You can only record sales for your assigned branch.'; end if;
 if not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and status='active') then raise exception 'Select an active branch belonging to this business.'; end if;
 if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and business_id=p_business_id) then raise exception 'Customer does not belong to this business.'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one item.'; end if;
 if coalesce(p_discount,0)<0 or coalesce(p_tax,0)<0 then raise exception 'Discount and tax cannot be negative.'; end if;
 for v_product_id,v_needed in select (value->>'product_id')::uuid,sum((value->>'quantity')::numeric) from jsonb_array_elements(p_items) group by (value->>'product_id')::uuid loop
  select * into v_product from public.products where id=v_product_id and business_id=p_business_id and is_active=true;
  if not found then raise exception 'A selected product or service is unavailable.'; end if;
  if v_product.item_type='product' and v_product.track_stock then
   select quantity into v_available from public.stock_balances where business_id=p_business_id and branch_id=p_branch_id and product_id=v_product_id for update;
   if coalesce(v_available,0)<v_needed then raise exception 'Insufficient stock for % (available: %, requested: %).',v_product.name,coalesce(v_available,0),v_needed; end if;
  end if;
 end loop;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=p_business_id and is_active=true;
  v_qty:=(v_item->>'quantity')::numeric; v_price:=coalesce((v_item->>'unit_price')::numeric,v_product.selling_price);
  if v_qty<=0 or v_price<0 then raise exception 'Quantity must be positive and price cannot be negative.'; end if;
  v_subtotal:=v_subtotal+v_qty*v_price;
 end loop;
 v_total:=greatest(0,v_subtotal-coalesce(p_discount,0)+coalesce(p_tax,0));
 if v_total<=0 or v_total<>trunc(v_total) then raise exception 'M-Pesa Sandbox checkout requires a positive whole-KSh total.'; end if;
 v_sale_number:='SALE-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.sales(business_id,branch_id,customer_id,sale_number,subtotal,discount,tax,total,amount_paid,balance,payment_method,status,notes,created_by)
 values(p_business_id,p_branch_id,p_customer_id,v_sale_number,v_subtotal,coalesce(p_discount,0),coalesce(p_tax,0),v_total,0,v_total,'mpesa','pending_payment',p_notes,auth.uid()) returning id into v_sale_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=p_business_id;
  v_qty:=(v_item->>'quantity')::numeric; v_price:=coalesce((v_item->>'unit_price')::numeric,v_product.selling_price);
  insert into public.sale_items(business_id,sale_id,product_id,item_name,quantity,unit_price,unit_cost,line_total)
  values(p_business_id,v_sale_id,v_product.id,v_product.name,v_qty,v_price,v_product.cost_price,v_qty*v_price);
 end loop;
 return jsonb_build_object('sale_id',v_sale_id,'sale_number',v_sale_number,'amount',v_total);
end; $$;
revoke all on function public.create_pending_pos_sale(uuid,uuid,jsonb,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.create_pending_pos_sale(uuid,uuid,jsonb,uuid,numeric,numeric,text) to authenticated;

create or replace function public.process_daraja_stk_callback(
 p_checkout_request_id text,p_callback_token_hash text,p_result_code integer,p_result_description text,
 p_amount numeric default null,p_mpesa_receipt_number text default null,p_phone_number text default null,
 p_transaction_date timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.daraja_stk_requests%rowtype; v_payment_id uuid; v_balance numeric(14,2); v_allocate numeric(14,2);
 v_sale public.sales%rowtype; v_item record; v_available numeric;
begin
 select * into v_request from public.daraja_stk_requests where checkout_request_id=p_checkout_request_id and callback_token_hash=p_callback_token_hash for update;
 if not found then raise exception 'Unknown Daraja callback request'; end if;
 if v_request.status<>'pending' then return jsonb_build_object('ok',true,'duplicate',true,'status',v_request.status); end if;
 update public.daraja_stk_requests set result_code=p_result_code,result_description=left(coalesce(p_result_description,''),500),
 mpesa_receipt_number=p_mpesa_receipt_number,transaction_date=p_transaction_date,updated_at=now() where id=v_request.id;
 if p_result_code<>0 then
  if v_request.sale_id is not null then update public.sales set status='void' where id=v_request.sale_id and status='pending_payment'; end if;
  update public.daraja_stk_requests set status='failed',updated_at=now() where id=v_request.id;
  return jsonb_build_object('ok',true,'status','failed');
 end if;
 if p_amount is null or p_amount<>v_request.amount then raise exception 'Daraja callback amount does not match request'; end if;
 if nullif(trim(coalesce(p_mpesa_receipt_number,'')),'') is null then raise exception 'Successful callback is missing M-Pesa receipt'; end if;
 select id into v_payment_id from public.business_payments where business_id=v_request.business_id and payment_method='mpesa' and external_reference=p_mpesa_receipt_number;
 if v_payment_id is not null then
  update public.daraja_stk_requests set status='confirmed',payment_id=v_payment_id,updated_at=now() where id=v_request.id;
  return jsonb_build_object('ok',true,'duplicate_receipt',true,'status','confirmed','payment_id',v_payment_id);
 end if;
 if v_request.sale_id is not null then
  select * into v_sale from public.sales where id=v_request.sale_id and business_id=v_request.business_id for update;
  if not found or v_sale.status<>'pending_payment' or v_sale.total<>v_request.amount then raise exception 'Pending POS sale is unavailable or amount mismatch'; end if;
  for v_item in select si.*,p.item_type,p.track_stock,p.cost_price from public.sale_items si join public.products p on p.id=si.product_id and p.business_id=si.business_id where si.sale_id=v_sale.id and si.business_id=v_sale.business_id loop
   if v_item.item_type='product' and v_item.track_stock then
    select quantity into v_available from public.stock_balances where business_id=v_sale.business_id and branch_id=v_sale.branch_id and product_id=v_item.product_id for update;
    if coalesce(v_available,0)<v_item.quantity then raise exception 'Insufficient stock to complete this sale after payment'; end if;
   end if;
  end loop;
  for v_item in select si.*,p.item_type,p.track_stock,p.cost_price from public.sale_items si join public.products p on p.id=si.product_id and p.business_id=si.business_id where si.sale_id=v_sale.id and si.business_id=v_sale.business_id loop
   if v_item.item_type='product' and v_item.track_stock then
    update public.stock_balances set quantity=quantity-v_item.quantity,updated_at=now() where business_id=v_sale.business_id and branch_id=v_sale.branch_id and product_id=v_item.product_id;
    insert into public.stock_movements(business_id,branch_id,product_id,movement_type,quantity_delta,unit_cost,reference_type,reference_id,notes,created_by)
    values(v_sale.business_id,v_sale.branch_id,v_item.product_id,'sale',-v_item.quantity,v_item.cost_price,'sale',v_sale.id,v_sale.sale_number,v_sale.created_by);
   end if;
  end loop;
  update public.sales set status='completed',amount_paid=v_sale.total,balance=0,mpesa_transaction_code=p_mpesa_receipt_number where id=v_sale.id;
  insert into public.audit_logs(actor_user_id,business_id,event_type,entity_type,entity_id,details)
  values(v_sale.created_by,v_sale.business_id,'sale.completed','sale',v_sale.id::text,jsonb_build_object('sale_number',v_sale.sale_number,'total',v_sale.total,'provider','daraja'));
  insert into public.business_payments(business_id,branch_id,direction,payment_type,customer_id,amount,currency_code,payment_method,status,payment_date,receipt_number,external_reference,payer_payee,notes,provider,idempotency_key,created_by)
  values(v_sale.business_id,v_sale.branch_id,'in','customer_receipt',v_sale.customer_id,v_sale.total,'KES','mpesa','confirmed',coalesce(p_transaction_date,now()),p_mpesa_receipt_number,p_mpesa_receipt_number,coalesce(p_phone_number,v_request.phone_number),'POS sale '||v_sale.sale_number,'daraja','daraja-pos-'||p_checkout_request_id,v_sale.created_by)
  returning id into v_payment_id;
  update public.daraja_stk_requests set status='confirmed',payment_id=v_payment_id,updated_at=now() where id=v_request.id;
  return jsonb_build_object('ok',true,'status','confirmed','sale_id',v_sale.id,'payment_id',v_payment_id);
 end if;
 select greatest(0,i.total-coalesce(sum(a.amount) filter(where bp.status='confirmed'),0)) into v_balance
 from public.business_invoices i left join public.payment_allocations a on a.invoice_id=i.id left join public.business_payments bp on bp.id=a.payment_id
 where i.id=v_request.invoice_id group by i.id;
 v_allocate:=least(v_request.amount,coalesce(v_balance,0));
 insert into public.business_payments(business_id,branch_id,direction,payment_type,customer_id,amount,currency_code,payment_method,status,payment_date,receipt_number,external_reference,payer_payee,notes,provider,idempotency_key,created_by,verified_by)
 values(v_request.business_id,v_request.branch_id,'in','customer_receipt',v_request.customer_id,v_request.amount,'KES','mpesa','confirmed',coalesce(p_transaction_date,now()),p_mpesa_receipt_number,p_mpesa_receipt_number,coalesce(p_phone_number,v_request.phone_number),'Safaricom Daraja STK Push · '||v_request.account_reference,'daraja','daraja-stk-'||p_checkout_request_id,v_request.created_by,null)
 on conflict(business_id,provider,idempotency_key) where provider is not null and idempotency_key is not null do nothing returning id into v_payment_id;
 if v_payment_id is null then select id into v_payment_id from public.business_payments where business_id=v_request.business_id and provider='daraja' and idempotency_key='daraja-stk-'||p_checkout_request_id; end if;
 if v_allocate>0 then insert into public.payment_allocations(business_id,payment_id,invoice_id,amount) values(v_request.business_id,v_payment_id,v_request.invoice_id,v_allocate) on conflict(payment_id,invoice_id) where invoice_id is not null do nothing; end if;
 update public.daraja_stk_requests set status='confirmed',payment_id=v_payment_id,updated_at=now() where id=v_request.id;
 return jsonb_build_object('ok',true,'status','confirmed','payment_id',v_payment_id,'allocated_amount',v_allocate,'unallocated_amount',v_request.amount-v_allocate);
end; $$;
revoke all on function public.process_daraja_stk_callback(text,text,integer,text,numeric,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.process_daraja_stk_callback(text,text,integer,text,numeric,text,text,timestamptz) to service_role;
