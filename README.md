# Digi Biashara — fresh build

This is a new, separate implementation. It does not overwrite the earlier deployed Digi Biashara application.

## Stack
Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS, Vercel.

## Setup
1. Copy `.env.example` to `.env.local` and fill in the new Supabase project URL and publishable key.
2. Run `npm install` and `npm run dev`.
3. For a fresh Supabase project, run `supabase/schema.sql` in the Supabase SQL Editor. This is the reproducible schema snapshot; the connected project already has the schema applied.
4. In Supabase Auth settings, turn off **Confirm email** for direct account creation (password entered at signup, no email OTP or verification link). Email and phone remain contact fields.
5. Create your first Super Admin account using `/account/create`.
6. Promote that account to Super Admin by running this SQL in the Supabase SQL Editor, replacing `ADMIN_EMAIL` with its email:
```sql
insert into public.platform_roles (user_id, role, full_name, status)
select id, 'super_admin', coalesce(raw_user_meta_data->>'full_name', email), 'active'
from auth.users where lower(email) = lower('ADMIN_EMAIL')
on conflict (user_id) do update set role='super_admin', status='active';
```
7. Agents and referred owners first use `/account/create` to create a login account. Agents are activated by the Super Admin under Platform → Agents. Owners can self-register through `/register`, or an Admin/Agent can register a business for their account.

## Routes
`/`, `/register`, `/login`, `/platform/dashboard`, `/platform/businesses`, `/platform/categories`, `/platform/agents`, `/platform/subscriptions`, `/agent/dashboard`, `/admin/dashboard`, `/employee/dashboard`.

## Security
Tenant records are protected by Supabase Row Level Security. Owner registration uses a constrained database RPC. Do not put a service-role key into browser code. Agent attribution cannot be self-assigned. A suspended subscription does not delete tenant data.

## Deployment
The Vercel project is `digi-biashara-fresh`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in its project environment before deploying. Keep this project separate from the earlier production deployment.

## Delivery status
This first stage delivers the secure tenant and platform foundation, authentication entry points, category catalogue, and account/subscription records. Sales/POS, inventory, M-Pesa callback verification, attendance, purchasing, and specialist category workflows remain to be implemented and tested before customer use.
