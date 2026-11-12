-- A customer-facing Till number is sufficient for manual M-Pesa code recording.
alter table public.business_mpesa_accounts drop constraint if exists business_mpesa_account_shortcode_check;
