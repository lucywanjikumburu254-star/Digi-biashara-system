-- Enforce subscription suspension across business RLS while preserving owner billing access.
-- Also make the suspension deadline automatic and create idempotent 10/7/3/1-day reminders.

create or replace function private.is_business_billing_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
  );
$$;

create or replace function private.is_business_billing_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.role = 'owner'
      and bm.status = 'active'
  );
$$;

grant execute on function private.is_business_billing_member(uuid) to authenticated;
grant execute on function private.is_business_billing_owner(uuid) to authenticated;

create or replace function private.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships bm
    join public.businesses b on b.id = bm.business_id
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
      and b.status = 'active'
      and not exists (
        select 1 from public.business_subscriptions s
        where s.business_id = b.id
          and s.status in ('suspended', 'cancelled')
      )
  );
$$;

create or replace function private.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships bm
    join public.businesses b on b.id = bm.business_id
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.role = 'owner'
      and bm.status = 'active'
      and b.status = 'active'
      and not exists (
        select 1 from public.business_subscriptions s
        where s.business_id = b.id
          and s.status in ('suspended', 'cancelled')
      )
  );
$$;

-- Assigned-branch RLS access must also stop at the suspension boundary.
create or replace function private.is_branch_assigned(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
    from public.business_memberships bm
    join public.branches br on br.id = bm.branch_id
    join public.businesses b on b.id = br.business_id
    where bm.branch_id = p_branch_id
      and bm.user_id = (select auth.uid())
      and bm.role = 'employee'
      and bm.status = 'active'
      and bm.permissions->>'sales' = 'true'
      and br.status = 'active'
      and b.status = 'active'
      and not exists (
        select 1 from public.business_subscriptions s
        where s.business_id = b.id
          and s.status in ('suspended', 'cancelled')
      )
  );
$;

-- A suspended business may read only its own account status so the owner can
-- reach billing and staff can see the suspension screen.
drop policy if exists businesses_read on public.businesses;
create policy businesses_read on public.businesses
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_business_member(id)
  or private.is_business_billing_member(id)
  or (private.is_platform_agent() and agent_user_id = (select auth.uid()))
);

-- Active staff need the subscription deadline to receive the same reminder
-- popup as the owner. Billing rows remain read-only to the owner.
drop policy if exists subscriptions_read on public.business_subscriptions;
create policy subscriptions_read on public.business_subscriptions
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_business_billing_member(business_id)
  or (private.is_platform_agent() and exists (
    select 1 from public.businesses b
    where b.id = business_subscriptions.business_id
      and b.agent_user_id = (select auth.uid())
  ))
);

drop policy if exists business_notifications_read on public.business_notifications;
create policy business_notifications_read on public.business_notifications
for select to authenticated
using (private.is_platform_admin() or private.is_business_billing_owner(business_id));

drop policy if exists business_notifications_update on public.business_notifications;
create policy business_notifications_update on public.business_notifications
for update to authenticated
using (private.is_platform_admin() or private.is_business_billing_owner(business_id))
with check (private.is_platform_admin() or private.is_business_billing_owner(business_id));

drop policy if exists invoices_read on public.subscription_invoices;
create policy invoices_read on public.subscription_invoices
for select to authenticated
using (private.is_platform_admin() or private.is_business_billing_owner(business_id));

drop policy if exists payments_read on public.subscription_payments;
create policy payments_read on public.subscription_payments
for select to authenticated
using (private.is_platform_admin() or private.is_business_billing_owner(business_id));

alter table public.business_notifications
  add column if not exists reminder_stage_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_notifications_reminder_stage_days_check'
      and conrelid = 'public.business_notifications'::regclass
  ) then
    alter table public.business_notifications
      add constraint business_notifications_reminder_stage_days_check
      check (reminder_stage_days is null or reminder_stage_days in (10, 7, 3, 1));
  end if;
end;
$$;

create unique index if not exists business_notifications_subscription_reminder_unique
  on public.business_notifications (business_id, scheduled_for, reminder_stage_days)
  where notification_type = 'payment_reminder'
    and reminder_stage_days is not null;

create or replace function private.process_due_business_suspensions()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $$
declare
  v_scheduled integer := 0;
  v_reminders integer := 0;
  v_suspended integer := 0;
begin
  -- Establish a suspension deadline automatically. Trial accounts receive
  -- their configured grace period after trial expiry; paid subscriptions
  -- receive it after the billing due date.
  with scheduled as (
    update public.business_subscriptions s
       set scheduled_suspend_at = coalesce(
             s.scheduled_suspend_at,
             (case
               when s.status = 'trial' then coalesce(s.trial_ends_at, s.due_at, s.current_period_ends_at)
               else coalesce(s.due_at, s.current_period_ends_at, s.trial_ends_at)
             end) + make_interval(days => coalesce(s.grace_period_days, 3))
           ),
           updated_at = now()
     where s.status in ('trial', 'payment_due', 'grace_period', 'active')
       and s.scheduled_suspend_at is null
       and (case
              when s.status = 'trial' then coalesce(s.trial_ends_at, s.due_at, s.current_period_ends_at)
              else coalesce(s.due_at, s.current_period_ends_at, s.trial_ends_at)
            end) is not null
    returning s.business_id
  )
  select count(*) into v_scheduled from scheduled;

  -- One notification per reminder stage and suspension deadline. The unique
  -- partial index plus ON CONFLICT keeps minute-by-minute cron runs idempotent.
  with candidates as (
    select s.business_id, s.scheduled_suspend_at, s.monthly_fee,
           greatest(1, ceil(extract(epoch from (s.scheduled_suspend_at - now())) / 86400.0)::integer) as days_left
    from public.business_subscriptions s
    where s.status in ('trial', 'payment_due', 'grace_period', 'active')
      and s.scheduled_suspend_at > now()
      and s.scheduled_suspend_at <= now() + interval '10 days'
  ), staged as (
    select c.*,
           case
             when c.days_left <= 1 then 1
             when c.days_left <= 3 then 3
             when c.days_left <= 7 then 7
             else 10
           end as stage_days
    from candidates c
  ), inserted as (
    insert into public.business_notifications
      (business_id, title, message, notification_type, scheduled_for, reminder_stage_days)
    select business_id,
           'Your Digi Biashara subscription is due soon',
           'Reminder stage: ' || stage_days || ' days before suspension. ' ||
           'There are ' || days_left || ' day(s) remaining. Please pay KSh ' ||
           to_char(monthly_fee, 'FM999,999,990.00') ||
           ' before ' ||
           to_char(scheduled_suspend_at at time zone 'Africa/Nairobi', 'DD Mon YYYY at HH12:MI AM') ||
           ' EAT to avoid automatic suspension. Your business data remains safe.',
           'payment_reminder',
           scheduled_suspend_at,
           stage_days
    from staged
    on conflict (business_id, scheduled_for, reminder_stage_days)
      where notification_type = 'payment_reminder' and reminder_stage_days is not null
    do nothing
    returning id
  )
  select count(*) into v_reminders from inserted;

  with due as (
    update public.business_subscriptions s
       set status = 'suspended',
           suspended_at = coalesce(s.suspended_at, now()),
           suspension_reason = coalesce(s.suspension_reason, 'Scheduled subscription suspension'),
           updated_at = now()
     where s.status in ('trial', 'payment_due', 'grace_period', 'active')
       and s.scheduled_suspend_at is not null
       and s.scheduled_suspend_at <= now()
    returning s.business_id, s.scheduled_suspend_at
  ), biz as (
    update public.businesses b
       set status = 'suspended', updated_at = now()
      from due d
     where b.id = d.business_id
    returning b.id, d.scheduled_suspend_at
  ), notices as (
    insert into public.business_notifications
      (business_id, title, message, notification_type, scheduled_for)
    select id,
           'Your business account has been suspended',
           'Your Digi Biashara workspace was suspended at the scheduled time due to an unpaid subscription. Your business data remains safe. Please contact support to restore access.',
           'suspension',
           scheduled_suspend_at
    from biz
    returning id
  )
  select count(*) into v_suspended from notices;

  return jsonb_build_object(
    'suspension_dates_scheduled', v_scheduled,
    'reminders_created', v_reminders,
    'businesses_suspended', v_suspended
  );
end;
$$;
