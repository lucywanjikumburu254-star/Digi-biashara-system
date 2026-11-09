
-- Digi Biashara database schema snapshot.
-- Safe to apply to a fresh Supabase project. Statements are idempotent where practical.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create table if not exists public.category_groups(
 id uuid primary key, code text not null unique, name text not null unique, sort_order integer not null,
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.business_categories(
 id uuid primary key, group_id uuid not null references public.category_groups(id) on delete restrict,
 code text not null unique, slug text not null unique, name text not null, sort_order integer not null,
 status text not null default 'active' check(status in ('active','inactive','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(group_id,name)
);
create table if not exists public.category_templates(
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.business_categories(id) on delete restrict,
 version integer not null default 1, status text not null default 'draft' check(status in ('draft','published','archived')),
 description text not null default '', module_flags jsonb not null default '{}'::jsonb,
 category_fields jsonb not null default '[]'::jsonb, sample_catalogue jsonb not null default '[]'::jsonb,
 reporting_hints jsonb not null default '[]'::jsonb, published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(category_id,version)
);
create table if not exists public.platform_roles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('super_admin','agent')), full_name text not null, phone text, email text,
 agent_code text unique, territory text, status text not null default 'active' check(status in ('active','disabled','suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.businesses(
 id uuid primary key default gen_random_uuid(), name text not null,
 category_id uuid not null references public.business_categories(id) on delete restrict,
 location text, phone text, currency_code text not null default 'KES',
 status text not null default 'active' check(status in ('active','suspended','archived')),
 agent_user_id uuid references public.platform_roles(user_id) on delete set null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists businesses_category_idx on public.businesses(category_id);
create index if not exists businesses_agent_idx on public.businesses(agent_user_id);
create table if not exists public.branches(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, address text, phone text, opening_time time, closing_time time,
 latitude numeric(10,7), longitude numeric(10,7),
 attendance_radius_metres integer not null default 150 check(attendance_radius_metres between 20 and 5000),
 status text not null default 'active' check(status in ('active','disabled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,name), unique(business_id,id)
);
create index if not exists branches_business_idx on public.branches(business_id);
create table if not exists public.business_memberships(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, branch_id uuid,
 role text not null check(role in ('owner','employee')), status text not null default 'active' check(status in ('active','disabled')),
 permissions jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,user_id),
 constraint memberships_branch_business_fk foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create index if not exists memberships_user_idx on public.business_memberships(user_id,status);
create index if not exists memberships_business_idx on public.business_memberships(business_id,status);
create table if not exists public.business_template_snapshots(
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses(id) on delete cascade,
 category_id uuid not null references public.business_categories(id) on delete restrict, template_version integer not null,
 template_snapshot jsonb not null, applied_at timestamptz not null default now(), applied_by uuid references auth.users(id) on delete set null
);
create table if not exists public.business_subscriptions(
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses(id) on delete cascade,
 plan_code text not null default 'founding_300',
 status text not null default 'trial' check(status in ('active','trial','payment_due','grace_period','suspended','cancelled')),
 billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','annual')),
 currency_code text not null default 'KES', monthly_fee numeric(12,2) not null default 3000 check(monthly_fee>=0),
 trial_starts_at timestamptz not null default now(), trial_ends_at timestamptz not null default(now()+interval '30 days'),
 current_period_starts_at timestamptz not null default now(), current_period_ends_at timestamptz not null default(now()+interval '30 days'),
 due_at timestamptz, grace_period_days integer not null default 3 check(grace_period_days between 0 and 30),
 suspended_at timestamptz, cancelled_at timestamptz, updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists subscriptions_status_due_idx on public.business_subscriptions(status,due_at);
create table if not exists public.subscription_invoices(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 subscription_id uuid not null references public.business_subscriptions(id) on delete cascade,
 invoice_number text not null unique, amount_due numeric(12,2) not null check(amount_due>=0),
 amount_paid numeric(12,2) not null default 0 check(amount_paid>=0), currency_code text not null default 'KES',
 status text not null default 'unpaid' check(status in ('draft','unpaid','part_paid','paid','void','overdue')),
 issued_at timestamptz not null default now(), due_at timestamptz not null, paid_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists invoices_business_idx on public.subscription_invoices(business_id,due_at desc);
create table if not exists public.subscription_payments(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid references public.subscription_invoices(id) on delete set null,
 subscription_id uuid not null references public.business_subscriptions(id) on delete cascade,
 provider text not null default 'manual' check(provider in ('mpesa','manual','bank','other')),
 amount numeric(12,2) not null check(amount>0), currency_code text not null default 'KES',
 provider_reference text, status text not null default 'pending' check(status in ('pending','confirmed','failed','reversed')),
 idempotency_key text unique, received_at timestamptz, confirmed_at timestamptz,
 confirmed_by uuid references auth.users(id) on delete set null, notes text, created_at timestamptz not null default now(),
 unique(provider,provider_reference)
);
create index if not exists payments_business_idx on public.subscription_payments(business_id,created_at desc);
create table if not exists public.audit_logs(
 id bigint generated always as identity primary key, actor_user_id uuid references auth.users(id) on delete set null,
 business_id uuid references public.businesses(id) on delete cascade, event_type text not null, entity_type text not null,
 entity_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_logs_business_idx on public.audit_logs(business_id,created_at desc);

create or replace function private.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_roles pr where pr.user_id=(select auth.uid()) and pr.role='super_admin' and pr.status='active');
$$;
create or replace function private.is_platform_agent() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_roles pr where pr.user_id=(select auth.uid()) and pr.role='agent' and pr.status='active');
$$;
create or replace function private.is_business_owner(p_business_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_memberships bm where bm.business_id=p_business_id and bm.user_id=(select auth.uid()) and bm.role='owner' and bm.status='active');
$$;
create or replace function private.is_business_member(p_business_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_memberships bm where bm.business_id=p_business_id and bm.user_id=(select auth.uid()) and bm.status='active');
$$;
create or replace function private.is_branch_assigned(p_branch_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_memberships bm where bm.branch_id=p_branch_id and bm.user_id=(select auth.uid()) and bm.role='employee' and bm.status='active');
$$;
create or replace function private.business_is_operational(p_business_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.businesses b join public.business_subscriptions s on s.business_id=b.id where b.id=p_business_id and b.status='active' and s.status in ('active','trial','payment_due','grace_period'));
$$;
revoke all on function private.is_platform_admin(),private.is_platform_agent(),private.is_business_owner(uuid),private.is_business_member(uuid),private.is_branch_assigned(uuid),private.business_is_operational(uuid) from public,anon;
grant execute on function private.is_platform_admin(),private.is_platform_agent(),private.is_business_owner(uuid),private.is_business_member(uuid),private.is_branch_assigned(uuid),private.business_is_operational(uuid) to authenticated;

alter table public.category_groups enable row level security;
alter table public.business_categories enable row level security;
alter table public.category_templates enable row level security;
alter table public.platform_roles enable row level security;
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_template_snapshots enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists category_groups_anon_read on public.category_groups;
create policy category_groups_anon_read on public.category_groups for select to anon using(status='active');
drop policy if exists category_groups_authenticated_read on public.category_groups;
create policy category_groups_authenticated_read on public.category_groups for select to authenticated using(status='active' or private.is_platform_admin());
drop policy if exists category_groups_admin on public.category_groups;
create policy category_groups_admin on public.category_groups for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());

drop policy if exists business_categories_anon_read on public.business_categories;
create policy business_categories_anon_read on public.business_categories for select to anon using(status='active');
drop policy if exists business_categories_authenticated_read on public.business_categories;
create policy business_categories_authenticated_read on public.business_categories for select to authenticated using(status='active' or private.is_platform_admin());
drop policy if exists business_categories_admin on public.business_categories;
create policy business_categories_admin on public.business_categories for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());

drop policy if exists templates_anon_read on public.category_templates;
create policy templates_anon_read on public.category_templates for select to anon using(status='published');
drop policy if exists templates_authenticated_read on public.category_templates;
create policy templates_authenticated_read on public.category_templates for select to authenticated using(status='published' or private.is_platform_admin());
drop policy if exists templates_admin on public.category_templates;
create policy templates_admin on public.category_templates for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());

drop policy if exists platform_roles_self_or_admin on public.platform_roles;
create policy platform_roles_self_or_admin on public.platform_roles for select to authenticated using(user_id=(select auth.uid()) or private.is_platform_admin());
drop policy if exists platform_roles_admin_manage on public.platform_roles;
create policy platform_roles_admin_manage on public.platform_roles for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());

drop policy if exists businesses_member_or_platform on public.businesses;
create policy businesses_member_or_platform on public.businesses for select to authenticated using(private.is_platform_admin() or private.is_business_member(id));
drop policy if exists businesses_agent_assigned_read on public.businesses;
create policy businesses_agent_assigned_read on public.businesses for select to authenticated using(private.is_platform_agent() and agent_user_id=(select auth.uid()));
drop policy if exists businesses_owner_update on public.businesses;
create policy businesses_owner_update on public.businesses for update to authenticated using(private.is_platform_admin() or private.is_business_owner(id)) with check(private.is_platform_admin() or private.is_business_owner(id));
drop policy if exists businesses_platform_insert on public.businesses;
create policy businesses_platform_insert on public.businesses for insert to authenticated with check(private.is_platform_admin());

drop policy if exists branches_member_read on public.branches;
create policy branches_member_read on public.branches for select to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id) or private.is_branch_assigned(id));
drop policy if exists branches_owner_manage on public.branches;
create policy branches_owner_manage on public.branches for all to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id)) with check(private.is_platform_admin() or private.is_business_owner(business_id));

drop policy if exists memberships_read on public.business_memberships;
create policy memberships_read on public.business_memberships for select to authenticated using(user_id=(select auth.uid()) or private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists memberships_owner_manage on public.business_memberships;
create policy memberships_owner_manage on public.business_memberships for all to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id)) with check(private.is_platform_admin() or private.is_business_owner(business_id));

drop policy if exists snapshots_read on public.business_template_snapshots;
create policy snapshots_read on public.business_template_snapshots for select to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists snapshots_owner_manage on public.business_template_snapshots;
create policy snapshots_owner_manage on public.business_template_snapshots for all to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id)) with check(private.is_platform_admin() or private.is_business_owner(business_id));

drop policy if exists subscriptions_owner_read on public.business_subscriptions;
create policy subscriptions_owner_read on public.business_subscriptions for select to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists subscriptions_admin_manage on public.business_subscriptions;
create policy subscriptions_admin_manage on public.business_subscriptions for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());
drop policy if exists subscriptions_agent_assigned_read on public.business_subscriptions;
create policy subscriptions_agent_assigned_read on public.business_subscriptions for select to authenticated using(private.is_platform_agent() and exists(select 1 from public.businesses b where b.id=business_subscriptions.business_id and b.agent_user_id=(select auth.uid())));

drop policy if exists invoices_owner_read on public.subscription_invoices;
create policy invoices_owner_read on public.subscription_invoices for select to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists invoices_admin_manage on public.subscription_invoices;
create policy invoices_admin_manage on public.subscription_invoices for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());

drop policy if exists payments_owner_read on public.subscription_payments;
create policy payments_owner_read on public.subscription_payments for select to authenticated using(private.is_platform_admin() or private.is_business_owner(business_id));
drop policy if exists payments_admin_manage on public.subscription_payments;
create policy payments_admin_manage on public.subscription_payments for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());

drop policy if exists audit_logs_business_read on public.audit_logs;
create policy audit_logs_business_read on public.audit_logs for select to authenticated using(private.is_platform_admin() or (business_id is not null and private.is_business_owner(business_id)));
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using(private.is_platform_admin());

grant select on public.category_groups,public.business_categories,public.category_templates to anon,authenticated;
grant insert,update,delete on public.category_groups,public.business_categories,public.category_templates to authenticated;
grant select,insert,update,delete on public.platform_roles,public.businesses,public.branches,public.business_memberships,public.business_template_snapshots,public.business_subscriptions,public.subscription_invoices,public.subscription_payments,public.audit_logs to authenticated;
revoke update on public.businesses from authenticated;
grant update(name,location,phone,currency_code) on public.businesses to authenticated;
grant usage,select on all sequences in schema public to authenticated;

create or replace function private.register_business_core(p_business_name text,p_category_id uuid,p_location text default null,p_phone text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid();v_business uuid;v_branch uuid;v_tpl jsonb;
begin
 if v_uid is null then raise exception 'Sign in required.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_uid) then raise exception 'Platform accounts cannot self-register as business owners.';end if;
 if exists(select 1 from public.business_memberships where user_id=v_uid and role='owner' and status='active') then raise exception 'This account already owns a business.';end if;
 if length(trim(coalesce(p_business_name,'')))<2 then raise exception 'Business name is required.';end if;
 select jsonb_build_object('category_id',bc.id,'category_name',bc.name,'group_id',cg.id,'group_name',cg.name,'version',ct.version,'modules',ct.module_flags,'fields',ct.category_fields,'sample_catalogue',ct.sample_catalogue,'reporting_hints',ct.reporting_hints)
 into v_tpl from public.business_categories bc join public.category_groups cg on cg.id=bc.group_id
 join lateral(select t.* from public.category_templates t where t.category_id=bc.id and t.status='published' order by t.version desc limit 1) ct on true
 where bc.id=p_category_id and bc.status='active';
 if v_tpl is null then raise exception 'Published category template not found.';end if;
 insert into public.businesses(name,category_id,location,phone,created_by) values(trim(p_business_name),p_category_id,nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_phone,'')),''),v_uid) returning id into v_business;
 insert into public.branches(business_id,name,address,phone) values(v_business,'Main Branch',nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_phone,'')),'')) returning id into v_branch;
 insert into public.business_memberships(business_id,user_id,role,status) values(v_business,v_uid,'owner','active');
 insert into public.business_template_snapshots(business_id,category_id,template_version,template_snapshot,applied_by) values(v_business,p_category_id,(v_tpl->>'version')::int,v_tpl,v_uid);
 insert into public.business_subscriptions(business_id,status) values(v_business,'trial');
 insert into public.audit_logs(actor_user_id,business_id,event_type,entity_type,entity_id,details) values(v_uid,v_business,'business.registered','business',v_business::text,jsonb_build_object('category_id',p_category_id,'branch_id',v_branch));
 return v_business;
end;$$;
create or replace function public.register_business(p_business_name text,p_category_id uuid,p_location text default null,p_phone text default null)
returns uuid language sql security invoker set search_path=public,private,pg_temp as $$ select private.register_business_core(p_business_name,p_category_id,p_location,p_phone); $$;
revoke all on function private.register_business_core(text,uuid,text,text) from public,anon;
grant execute on function private.register_business_core(text,uuid,text,text) to authenticated;
revoke all on function public.register_business(text,uuid,text,text) from public,anon;
grant execute on function public.register_business(text,uuid,text,text) to authenticated;

create or replace function private.platform_set_subscription_status_core(p_business_id uuid,p_status text,p_due_at timestamptz default null,p_reason text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not private.is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 if p_status not in('active','trial','payment_due','grace_period','suspended','cancelled') then raise exception 'Invalid subscription status.';end if;
 update public.business_subscriptions set status=p_status,due_at=coalesce(p_due_at,due_at),suspended_at=case when p_status='suspended' then now() when p_status in('active','trial') then null else suspended_at end,updated_by=auth.uid(),updated_at=now() where business_id=p_business_id;
 if not found then raise exception 'Subscription not found.';end if;
 if p_status='suspended' then update public.businesses set status='suspended',updated_at=now() where id=p_business_id;
 elsif p_status in('active','trial','payment_due','grace_period') then update public.businesses set status='active',updated_at=now() where id=p_business_id;end if;
 insert into public.audit_logs(actor_user_id,business_id,event_type,entity_type,entity_id,details) values(auth.uid(),p_business_id,'subscription.status_changed','subscription',p_business_id::text,jsonb_build_object('status',p_status,'due_at',p_due_at,'reason',p_reason));
end;$$;
create or replace function public.platform_set_subscription_status(p_business_id uuid,p_status text,p_due_at timestamptz default null,p_reason text default null)
returns void language sql security invoker set search_path=public,private,pg_temp as $$ select private.platform_set_subscription_status_core(p_business_id,p_status,p_due_at,p_reason); $$;
revoke all on function private.platform_set_subscription_status_core(uuid,text,timestamptz,text) from public,anon;
grant execute on function private.platform_set_subscription_status_core(uuid,text,timestamptz,text) to authenticated;
revoke all on function public.platform_set_subscription_status(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.platform_set_subscription_status(uuid,text,timestamptz,text) to authenticated;

create or replace function private.platform_confirm_manual_payment_core(p_business_id uuid,p_amount numeric,p_reference text,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sub public.business_subscriptions%rowtype;v_payment uuid;
begin
 if not private.is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 if p_amount<=0 then raise exception 'Amount must be above zero.';end if;
 select * into v_sub from public.business_subscriptions where business_id=p_business_id for update;
 if not found then raise exception 'Subscription not found.';end if;
 insert into public.subscription_payments(business_id,subscription_id,provider,amount,provider_reference,status,received_at,confirmed_at,confirmed_by,notes)
 values(p_business_id,v_sub.id,'manual',p_amount,nullif(trim(coalesce(p_reference,'')),''),'confirmed',now(),now(),auth.uid(),p_reason) returning id into v_payment;
 update public.business_subscriptions set status='active',current_period_starts_at=now(),current_period_ends_at=now()+interval '1 month',due_at=now()+interval '1 month',suspended_at=null,updated_by=auth.uid(),updated_at=now() where id=v_sub.id;
 update public.businesses set status='active',updated_at=now() where id=p_business_id;
 insert into public.audit_logs(actor_user_id,business_id,event_type,entity_type,entity_id,details) values(auth.uid(),p_business_id,'subscription.payment_confirmed','subscription_payment',v_payment::text,jsonb_build_object('amount',p_amount,'reference',p_reference,'reason',p_reason));
 return v_payment;
end;$$;
create or replace function public.platform_confirm_manual_payment(p_business_id uuid,p_amount numeric,p_reference text,p_reason text default null)
returns uuid language sql security invoker set search_path=public,private,pg_temp as $$ select private.platform_confirm_manual_payment_core(p_business_id,p_amount,p_reference,p_reason); $$;
revoke all on function private.platform_confirm_manual_payment_core(uuid,numeric,text,text) from public,anon;
grant execute on function private.platform_confirm_manual_payment_core(uuid,numeric,text,text) to authenticated;
revoke all on function public.platform_confirm_manual_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.platform_confirm_manual_payment(uuid,numeric,text,text) to authenticated;

create or replace function private.platform_assign_agent_core(p_email text,p_full_name text,p_phone text default null,p_territory text default null,p_agent_code text default null)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid;v_code text;
begin
 if not private.is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 select id into v_uid from auth.users where lower(email)=lower(trim(p_email)) limit 1;
 if v_uid is null then raise exception 'No user account exists for this email. Ask agent to sign up first.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_uid and role='super_admin') then raise exception 'A platform administrator cannot be converted into an agent.';end if;
 if exists(select 1 from public.business_memberships where user_id=v_uid and role='owner' and status='active') then raise exception 'This user already owns a business and cannot use the agent-only login role.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_uid and role='super_admin') then raise exception 'A platform administrator cannot be converted into an agent.';end if;
 if exists(select 1 from public.business_memberships where user_id=v_uid and role='owner' and status='active') then raise exception 'This user already owns a business and cannot use the agent-only login role.';end if;
 v_code:=coalesce(nullif(trim(p_agent_code),''),'AG'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
 insert into public.platform_roles(user_id,role,full_name,phone,email,agent_code,territory,status)
 values(v_uid,'agent',trim(p_full_name),nullif(trim(coalesce(p_phone,'')),''),lower(trim(p_email)),v_code,nullif(trim(coalesce(p_territory,'')),''),'active')
 on conflict(user_id) do update set role='agent',full_name=excluded.full_name,phone=excluded.phone,email=excluded.email,agent_code=excluded.agent_code,territory=excluded.territory,status='active',updated_at=now();
 insert into public.audit_logs(actor_user_id,event_type,entity_type,entity_id,details) values(auth.uid(),'platform.agent_assigned','platform_role',v_uid::text,jsonb_build_object('email',lower(trim(p_email)),'code',v_code,'territory',p_territory));
 return v_uid;
end;$$;
create or replace function public.platform_assign_agent(p_email text,p_full_name text,p_phone text default null,p_territory text default null,p_agent_code text default null)
returns uuid language sql security invoker set search_path=public,private,pg_temp as $$ select private.platform_assign_agent_core(p_email,p_full_name,p_phone,p_territory,p_agent_code); $$;
revoke all on function private.platform_assign_agent_core(text,text,text,text,text) from public,anon;
grant execute on function private.platform_assign_agent_core(text,text,text,text,text) to authenticated;
revoke all on function public.platform_assign_agent(text,text,text,text,text) from public,anon;
grant execute on function public.platform_assign_agent(text,text,text,text,text) to authenticated;

create or replace function private.platform_set_agent_status_core(p_agent_user_id uuid,p_status text,p_reason text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not private.is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 if p_status not in('active','disabled','suspended') then raise exception 'Invalid agent status.';end if;
 update public.platform_roles set status=p_status,updated_at=now() where user_id=p_agent_user_id and role='agent';
 if not found then raise exception 'Agent record not found.';end if;
 insert into public.audit_logs(actor_user_id,event_type,entity_type,entity_id,details) values(auth.uid(),'platform.agent_status_changed','platform_role',p_agent_user_id::text,jsonb_build_object('status',p_status,'reason',p_reason));
end;$$;
create or replace function public.platform_set_agent_status(p_agent_user_id uuid,p_status text,p_reason text default null)
returns void language sql security invoker set search_path=public,private,pg_temp as $$ select private.platform_set_agent_status_core(p_agent_user_id,p_status,p_reason); $$;
revoke all on function private.platform_set_agent_status_core(uuid,text,text) from public,anon;
grant execute on function private.platform_set_agent_status_core(uuid,text,text) to authenticated;
revoke all on function public.platform_set_agent_status(uuid,text,text) from public,anon;
grant execute on function public.platform_set_agent_status(uuid,text,text) to authenticated;

create or replace function private.platform_register_business_core(p_owner_email text,p_owner_full_name text,p_business_name text,p_category_id uuid,p_location text default null,p_phone text default null,p_agent_user_id uuid default null,p_monthly_fee numeric default 3000)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_owner uuid;v_business uuid;v_branch uuid;v_tpl jsonb;
begin
 if not private.is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 select id into v_owner from auth.users where lower(email)=lower(trim(p_owner_email)) limit 1;
 if v_owner is null then raise exception 'Owner account must be created through sign up first.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_owner) then raise exception 'Platform accounts cannot also be business owner accounts.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_owner) then raise exception 'Platform accounts cannot also be business owner accounts.';end if;
 if exists(select 1 from public.business_memberships bm where bm.user_id=v_owner and bm.role='owner' and bm.status='active') then raise exception 'This account already owns a business.';end if;
 if p_monthly_fee<0 then raise exception 'Monthly fee cannot be negative.';end if;
 select jsonb_build_object('category_id',bc.id,'category_name',bc.name,'group_id',cg.id,'group_name',cg.name,'version',ct.version,'modules',ct.module_flags,'fields',ct.category_fields,'sample_catalogue',ct.sample_catalogue,'reporting_hints',ct.reporting_hints)
 into v_tpl from public.business_categories bc join public.category_groups cg on cg.id=bc.group_id
 join lateral(select t.* from public.category_templates t where t.category_id=bc.id and t.status='published' order by t.version desc limit 1) ct on true
 where bc.id=p_category_id and bc.status='active';
 if v_tpl is null then raise exception 'Published active category template required.';end if;
 if p_agent_user_id is not null and not exists(select 1 from public.platform_roles pr where pr.user_id=p_agent_user_id and pr.role='agent' and pr.status='active') then raise exception 'Agent is not active.';end if;
 insert into public.businesses(name,category_id,location,phone,created_by,agent_user_id) values(trim(p_business_name),p_category_id,nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_phone,'')),''),auth.uid(),p_agent_user_id) returning id into v_business;
 insert into public.branches(business_id,name,address,phone) values(v_business,'Main Branch',nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_phone,'')),'')) returning id into v_branch;
 insert into public.business_memberships(business_id,user_id,role,status) values(v_business,v_owner,'owner','active');
 insert into public.business_template_snapshots(business_id,category_id,template_version,template_snapshot,applied_by) values(v_business,p_category_id,(v_tpl->>'version')::int,v_tpl,auth.uid());
 insert into public.business_subscriptions(business_id,status,monthly_fee) values(v_business,'trial',p_monthly_fee);
 insert into public.audit_logs(actor_user_id,business_id,event_type,entity_type,entity_id,details) values(auth.uid(),v_business,'platform.business_registered','business',v_business::text,jsonb_build_object('owner_email',lower(trim(p_owner_email)),'owner_name',p_owner_full_name,'agent_user_id',p_agent_user_id,'category_id',p_category_id));
 return v_business;
end;$$;
create or replace function public.platform_register_business(p_owner_email text,p_owner_full_name text,p_business_name text,p_category_id uuid,p_location text default null,p_phone text default null,p_agent_user_id uuid default null,p_monthly_fee numeric default 3000)
returns uuid language sql security invoker set search_path=public,private,pg_temp as $$ select private.platform_register_business_core(p_owner_email,p_owner_full_name,p_business_name,p_category_id,p_location,p_phone,p_agent_user_id,p_monthly_fee); $$;
revoke all on function private.platform_register_business_core(text,text,text,uuid,text,text,uuid,numeric) from public,anon;
grant execute on function private.platform_register_business_core(text,text,text,uuid,text,text,uuid,numeric) to authenticated;
revoke all on function public.platform_register_business(text,text,text,uuid,text,text,uuid,numeric) from public,anon;
grant execute on function public.platform_register_business(text,text,text,uuid,text,text,uuid,numeric) to authenticated;

create or replace function private.agent_register_business_core(p_owner_email text,p_business_name text,p_category_id uuid,p_location text default null,p_phone text default null,p_monthly_fee numeric default 3000)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_owner uuid;v_business uuid;v_branch uuid;v_tpl jsonb;
begin
 if not private.is_platform_agent() then raise exception 'Active agent account required.';end if;
 select id into v_owner from auth.users where lower(email)=lower(trim(p_owner_email)) limit 1;
 if v_owner is null then raise exception 'Owner account must be created first.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_owner) then raise exception 'Platform accounts cannot also be business owner accounts.';end if;
 if exists(select 1 from public.platform_roles where user_id=v_owner) then raise exception 'Platform accounts cannot also be business owner accounts.';end if;
 if exists(select 1 from public.business_memberships bm where bm.user_id=v_owner and bm.role='owner' and bm.status='active') then raise exception 'This account already owns a business.';end if;
 if p_monthly_fee<0 then raise exception 'Monthly fee cannot be negative.';end if;
 select jsonb_build_object('category_id',bc.id,'category_name',bc.name,'group_id',cg.id,'group_name',cg.name,'version',ct.version,'modules',ct.module_flags,'fields',ct.category_fields,'sample_catalogue',ct.sample_catalogue,'reporting_hints',ct.reporting_hints)
 into v_tpl from public.business_categories bc join public.category_groups cg on cg.id=bc.group_id
 join lateral(select t.* from public.category_templates t where t.category_id=bc.id and t.status='published' order by t.version desc limit 1) ct on true
 where bc.id=p_category_id and bc.status='active';
 if v_tpl is null then raise exception 'Published active category template required.';end if;
 insert into public.businesses(name,category_id,location,phone,created_by,agent_user_id) values(trim(p_business_name),p_category_id,nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_phone,'')),''),auth.uid(),auth.uid()) returning id into v_business;
 insert into public.branches(business_id,name,address,phone) values(v_business,'Main Branch',nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_phone,'')),'')) returning id into v_branch;
 insert into public.business_memberships(business_id,user_id,role,status) values(v_business,v_owner,'owner','active');
 insert into public.business_template_snapshots(business_id,category_id,template_version,template_snapshot,applied_by) values(v_business,p_category_id,(v_tpl->>'version')::int,v_tpl,auth.uid());
 insert into public.business_subscriptions(business_id,status,monthly_fee) values(v_business,'trial',p_monthly_fee);
 insert into public.audit_logs(actor_user_id,business_id,event_type,entity_type,entity_id,details) values(auth.uid(),v_business,'agent.business_registered','business',v_business::text,jsonb_build_object('owner_email',lower(trim(p_owner_email)),'category_id',p_category_id,'branch_id',v_branch));
 return v_business;
end;$$;
create or replace function public.agent_register_business(p_owner_email text,p_business_name text,p_category_id uuid,p_location text default null,p_phone text default null,p_monthly_fee numeric default 3000)
returns uuid language sql security invoker set search_path=public,private,pg_temp as $$ select private.agent_register_business_core(p_owner_email,p_business_name,p_category_id,p_location,p_phone,p_monthly_fee); $$;
revoke all on function private.agent_register_business_core(text,text,uuid,text,text,numeric) from public,anon;
grant execute on function private.agent_register_business_core(text,text,uuid,text,text,numeric) to authenticated;
revoke all on function public.agent_register_business(text,text,uuid,text,text,numeric) from public,anon;
grant execute on function public.agent_register_business(text,text,uuid,text,text,numeric) to authenticated;

create or replace view public.agent_subscription_status with(security_invoker=true,security_barrier=true) as
 select b.id as business_id,b.name as business_name,s.status,s.plan_code,s.due_at,s.current_period_ends_at
 from public.businesses b join public.business_subscriptions s on s.business_id=b.id
 where b.agent_user_id=(select auth.uid())
 and exists(select 1 from public.platform_roles pr where pr.user_id=(select auth.uid()) and pr.role='agent' and pr.status='active');
grant select on public.agent_subscription_status to authenticated;

-- Seed the agreed 15 groups and 150 categories, each with a safe baseline template.
do $seed$
declare v_groups jsonb := '[["01","Retail Shops and General Trading",["General Retail Shop","Mini Supermarket","Supermarket","Wholesale Shop","Grocery and Green Grocery","Cosmetics and Beauty Shop","Boutique and Clothing Shop","Shoes and Footwear Shop","Electronics Shop","Household Goods Shop"]],["02","Food and Hospitality",["Restaurant","Hotel","Café and Coffee Shop","Fast Food Business","Butchery","Bakery","Cake and Pastry Shop","Catering Business","Bar and Lounge","Juice and Smoothie Bar"]],["03","Beauty and Personal Care",["Hair Salon","Barber Shop","Beauty Parlour","Nail Salon","Spa and Massage Centre","Cosmetics and Makeup Studio","Braiding and Hair Extensions","Tattoo and Piercing Studio","Beauty Training Academy","Laundry and Dry Cleaning"]],["04","Transport and Automotive",["Matatu Business","Matatu SACCO","Taxi Business","Ride-Hailing Business","Car Hire Business","Bus Company","Trucking and Logistics","Courier and Delivery Business","School Transport Business","Motorbike and Boda Boda Business"]],["05","Vehicle Services",["Garage and Motor Vehicle Repair","Car Wash","Tyre Centre","Auto Spare Parts Shop","Motorbike Repair Shop","Auto Electrical Services","Car Accessories Shop","Vehicle Towing Services","Vehicle Inspection Services","Motor Vehicle Painting and Body Works"]],["06","Construction and Hardware",["Hardware Shop","Building Materials Supplier","Cement and Steel Supplier","Plumbing Services","Electrical Installation Services","Welding and Fabrication","Carpentry and Joinery","Painting and Decoration","Construction Company","Interior Design and Furnishing"]],["07","Agriculture and Livestock",["Crop Farming","Dairy Farming","Poultry Farming","Pig Farming","Sheep and Goat Farming","Fish Farming","Animal Feeds Shop","Agrovet Shop","Farm Produce Trading","Agricultural Equipment and Machinery"]],["08","Professional and Office Services",["Cyber Café","Printing and Photocopying","Stationery Shop","Computer Sales and Repair","Software and IT Services","Accounting and Bookkeeping","Business Consultancy","Legal Services","Advertising and Marketing Agency","Photography and Videography"]],["09","Education and Training",["Primary School","Secondary School","College and University","Daycare and Nursery","Tuition Centre","Driving School","Computer Training Centre","Vocational Training Centre","Music and Dance Academy","Online Learning and Training Business"]],["10","Health and Wellness",["Pharmacy","Medical Clinic","Dental Clinic","Medical Laboratory","Optical Shop","Physiotherapy Centre","Veterinary Clinic","Medical Equipment Supplier","Fitness Centre and Gym","Nutrition and Wellness Centre"]],["11","Entertainment and Events",["Event Management","DJ and Entertainment Services","Video Production Company","Music Production Studio","Recording Studio","Cinema and Entertainment Centre","Event Equipment Hire","Wedding Planning Services","Conference and Meeting Venue","Sports and Recreation Centre"]],["12","Accommodation and Property",["Guest House","Lodge and Resort","Airbnb and Short-Stay Accommodation","Rental Property Management","Real Estate Agency","Property Development Company","Property Maintenance Services","Building and Room Rentals","Campsite and Outdoor Accommodation","Furniture and Home Décor Shop"]],["13","Manufacturing and Production",["Food Processing Business","Dairy Processing","Water Bottling Business","Bakery Production","Furniture Manufacturing","Metal Fabrication and Manufacturing","Clothing and Textile Manufacturing","Soap and Detergent Manufacturing","Plastic Products Manufacturing","Packaging and Printing Manufacturing"]],["14","Personal and Household Services",["Domestic Cleaning Services","Pest Control Services","Security Services","Gardening and Landscaping","Plumbing Maintenance","Electrical Repair Services","Water Supply Business","Gas and LPG Distribution","Waste Collection and Recycling","Home Appliance Repair"]],["15","Financial, Trading and Specialised Businesses",["M-Pesa and Mobile Money Agent","Banking Agent","Insurance Agency","Microfinance Business","SACCO","Hardware and Machinery Rental","General Equipment Hire","Scrap Metal Trading","Wholesale Distribution Business","General Service and Consultancy Business"]]]'::jsonb; g jsonb; cat text; n integer; gid uuid; cid uuid; cat_code text; slug text;
begin
 for g in select value from jsonb_array_elements(v_groups) loop
  gid:=md5('group:'||(g->>'code'))::uuid;
  insert into public.category_groups(id,code,name,sort_order,status)
  values(gid,g->>'code',g->>'name',(g->>'code')::int,'active')
  on conflict(code) do update set name=excluded.name,sort_order=excluded.sort_order,status='active';
  n:=0;
  for cat in select value from jsonb_array_elements_text(g->'categories') loop
   n:=n+1;cat_code:=(g->>'code')||'.'||n;cid:=md5('category:'||cat_code)::uuid;
   slug:=trim(both '-' from regexp_replace(lower(cat),'[^a-z0-9]+','-','g'));
   insert into public.business_categories(id,group_id,code,slug,name,sort_order,status)
   values(cid,gid,cat_code,slug,cat,n,'active')
   on conflict(code) do update set group_id=excluded.group_id,slug=excluded.slug,name=excluded.name,sort_order=excluded.sort_order,status='active';
   insert into public.category_templates(category_id,version,status,description,module_flags,category_fields,sample_catalogue,reporting_hints,published_at)
   values(cid,1,'published','Baseline category setup for '||cat||'. Category-specific workflows are marked planned until fully implemented and tested.',
    '{"workspace":"available","sales_pos":"planned","inventory":"planned","purchases":"planned","expenses":"planned","suppliers":"planned","customers":"planned","staff":"planned","branches":"planned","reports":"planned","mpesa":"requires_configuration","appointments":"planned","bookings":"planned","production":"planned","fleet":"planned","projects":"planned","specialised_workflows":"planned"}'::jsonb,
    '[{"name":"SKU / reference","type":"text","required":false},{"name":"Description","type":"text","required":false},{"name":"Unit","type":"text","required":true},{"name":"Selling price","type":"currency","required":false}]'::jsonb,
    '[]'::jsonb,'[]'::jsonb,now())
   on conflict(category_id,version) do update set status='published',description=excluded.description,module_flags=excluded.module_flags,category_fields=excluded.category_fields,published_at=coalesce(public.category_templates.published_at,now());
  end loop;
 end loop;
end;$seed$;

-- SECURITY DEFINER implementations are private; exposed RPC wrappers are invoker functions.
