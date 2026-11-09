# Digi Biashara — fresh build

This is a new, separate implementation. It does not overwrite the earlier deployed Digi Biashara application.

## Stack
Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS, Vercel.

## Setup
1. Copy `.env.example` to `.env.local` and fill in the new Supabase project URL and publishable key.
2. Run `npm install` and `npm run dev`.
3. Apply the SQL migration in `supabase/migrations`.
4. In Supabase Auth settings, turn off **Confirm email** for direct owner registration (password entered at signup, no email OTP or verification link). Email and phone remain contact fields.
5. After the first user registers, assign the platform super-admin role with:
`insert into public.platform_roles (user_id, role, full_name, status) select id, 'super_admin', raw_user_meta_data->>'full_name', 'active' from auth.users where email = 'ADMIN_EMAIL' on conflict (user_id) do update set role='super_admin', status='active';`

## Routes
`/`, `/register`, `/login`, `/platform/dashboard`, `/platform/businesses`, `/platform/categories`, `/platform/agents`, `/platform/subscriptions`, `/agent/dashboard`, `/admin/dashboard`, `/employee/dashboard`.

## Security
Tenant records are protected by Supabase Row Level Security. Owner registration uses a constrained database RPC. Do not put a service-role key into browser code. Agent attribution cannot be self-assigned. A suspended subscription does not delete tenant data.

## Deployment\nThe Vercel project is `digi-biashara-fresh`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in its project environment before deploying. Keep this project separate from the earlier production deployment.\n\n## Delivery status
This first stage delivers the secure tenant and platform foundation, authentication entry points, category catalogue, and account/subscription records. Sales/POS, inventory, M-Pesa callback verification, attendance, purchasing, and specialist category workflows remain to be implemented and tested before customer use.
