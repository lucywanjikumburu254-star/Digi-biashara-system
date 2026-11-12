-- Keep the manual M-Pesa checkout RPC as SECURITY INVOKER.
-- Authenticated clients may update only the M-Pesa reference column, and only
-- on a sale they are allowed to access. Cashiers can set it once; owners/admins
-- may correct a code when necessary.

revoke update on public.sales from anon, authenticated;
grant update (mpesa_transaction_code) on public.sales to authenticated;

drop policy if exists sales_mpesa_reference_update on public.sales;
create policy sales_mpesa_reference_update
on public.sales
for update
to authenticated
using (
  (
    private.is_platform_admin()
    or private.is_business_owner(business_id)
    or private.is_branch_assigned(branch_id)
  )
  and (
    private.is_platform_admin()
    or private.is_business_owner(business_id)
    or mpesa_transaction_code is null
  )
)
with check (
  (
    private.is_platform_admin()
    or private.is_business_owner(business_id)
    or private.is_branch_assigned(branch_id)
  )
  and mpesa_transaction_code is not null
);

create or replace function public.record_manual_mpesa_sale(
  p_business_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_notes text default null,
  p_account_type text default 'paybill',
  p_reference text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sale_id uuid;
  v_reference text := upper(btrim(coalesce(p_reference, '')));
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if p_account_type not in ('paybill', 'till', 'pochi') then
    raise exception 'Choose a valid M-Pesa payment channel.';
  end if;
  if v_reference !~ '^[A-Z0-9]{6,20}$' then
    raise exception 'Enter a valid M-Pesa transaction code (6–20 letters or numbers).';
  end if;
  if not exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and (
        bm.role = 'owner'
        or (
          bm.role = 'employee'
          and bm.branch_id = p_branch_id
          and bm.permissions ->> 'sales' = 'true'
        )
      )
  ) then
    raise exception 'You do not have permission to record sales for this branch.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_business_id::text || ':' || v_reference, 0)
  );

  if exists (
    select 1 from public.sales s
    where s.business_id = p_business_id
      and upper(btrim(s.mpesa_transaction_code)) = v_reference
  ) then
    raise exception 'This M-Pesa transaction code has already been used for this business.';
  end if;

  v_sale_id := public.record_sale(
    p_business_id,
    p_branch_id,
    p_items,
    p_customer_id,
    'mpesa',
    coalesce(p_discount, 0),
    coalesce(p_tax, 0),
    null,
    p_notes
  );

  update public.sales
  set mpesa_transaction_code = v_reference
  where id = v_sale_id and business_id = p_business_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'The sale could not be updated with its M-Pesa transaction code.';
  end if;

  return v_sale_id;
end;
$$;

revoke all on function public.record_manual_mpesa_sale(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.record_manual_mpesa_sale(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text) to authenticated;
