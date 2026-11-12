create table if not exists public.business_mpesa_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  account_type text not null check (account_type in ('paybill','till','pochi')),
  account_number text not null,
  shortcode text,
  environment text check (environment in ('sandbox','production')),
  enabled boolean not null default true,
  consumer_key_ciphertext text,
  consumer_secret_ciphertext text,
  passkey_ciphertext text,
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected','configured','connected','failed')),
  last_connection_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_mpesa_account_type_unique unique (business_id, account_type),
  constraint business_mpesa_account_shortcode_check
    check (
      (account_type = 'till' and nullif(trim(coalesce(shortcode,'')),'') is not null)
      or account_type in ('paybill','pochi')
    )
);
create index if not exists business_mpesa_accounts_business_enabled_idx
  on public.business_mpesa_accounts (business_id, enabled);
alter table public.business_mpesa_accounts enable row level security;
revoke all on public.business_mpesa_accounts from anon, authenticated;
grant all on public.business_mpesa_accounts to service_role;
