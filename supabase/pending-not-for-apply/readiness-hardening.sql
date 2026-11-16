-- PENDING HARDENING ONLY — DO NOT APPLY TO THE CONNECTED DATABASE YET.
-- The live database currently records 42 migrations while this repository
-- tracks only 9 migration files. Reconstruct the complete migration history,
-- replay it on a disposable staging project, and test these policies before
-- converting this script into a normal migration.

begin;

-- Enforce the five-active-branch limit on reactivation as well as creation.
-- The per-business advisory lock serializes concurrent branch activations so
-- two simultaneous requests cannot both pass the active-count check.
create or replace function private.enforce_five_branches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_check_limit boolean := false;
begin
  if new.status = 'active' then
    if tg_op = 'INSERT' then
      v_check_limit := true;
    elsif tg_op = 'UPDATE' then
      v_check_limit :=
        new.business_id is distinct from old.business_id
        or old.status is distinct from 'active';
    end if;
  end if;

  if v_check_limit then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('branches:' || new.business_id::text, 0)
    );

    if (
      select count(*)
      from public.branches b
      where b.business_id = new.business_id
        and b.status = 'active'
    ) >= 5 then
      raise exception 'A business can have a maximum of five active branches.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists branches_max_five on public.branches;
create trigger branches_max_five
before insert or update of business_id, status
on public.branches
for each row
execute function private.enforce_five_branches();

-- A compact partial index supports the active-branch count in the trigger.
create index if not exists branches_active_business_idx
  on public.branches (business_id)
  where status = 'active';

-- The first membership SELECT policy already includes every row covered by
-- the suspended-account policy, including the platform-admin case.
drop policy if exists memberships_read_for_suspended_accounts
  on public.business_memberships;

-- Consolidate agent commission reads while preserving admin-only writes.
drop policy if exists agent_commissions_agent_read on public.agent_commissions;
drop policy if exists agent_commissions_admin_all on public.agent_commissions;

create policy agent_commissions_read
on public.agent_commissions
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (
    agent_user_id = (select auth.uid())
    and (select private.is_platform_agent())
  )
);

create policy agent_commissions_admin_insert
on public.agent_commissions
for insert
to authenticated
with check ((select private.is_platform_admin()));

create policy agent_commissions_admin_update
on public.agent_commissions
for update
to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

create policy agent_commissions_admin_delete
on public.agent_commissions
for delete
to authenticated
using ((select private.is_platform_admin()));

-- The employee-read policy already authorizes owners and platform admins to
-- read customers. Split owner/admin writes out from the former ALL policy.
drop policy if exists customers_owner_manage on public.customers;

create policy customers_owner_insert
on public.customers
for insert
to authenticated
with check (
  (select private.is_platform_admin())
  or (select private.is_business_owner(business_id))
);

create policy customers_owner_update
on public.customers
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_owner(business_id))
)
with check (
  (select private.is_platform_admin())
  or (select private.is_business_owner(business_id))
);

create policy customers_owner_delete
on public.customers
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_owner(business_id))
);

-- Supports the agent workspace's agent_user_id filter and newest-first list.
create index if not exists agent_commissions_agent_created_idx
  on public.agent_commissions (agent_user_id, created_at desc);

commit;
