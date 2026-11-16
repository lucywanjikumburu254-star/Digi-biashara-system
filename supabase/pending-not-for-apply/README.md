# Pending database hardening — NOT READY TO APPLY

This folder intentionally sits outside `supabase/migrations`. The SQL here is **not** part of the automated migration stream and must not be applied to the connected database yet.

## Why it is pending

The Supabase database reports 42 applied migration records, but the current Git branch contains only 9 SQL migration files. The missing migration history must be restored or reconstructed and replayed against a disposable staging project before any DDL or RLS policy changes are applied to the current project.

## Included changes

- Fixes the five-active-branch limit so reactivating a disabled branch is checked.
- Serializes branch activation/creation per business to prevent concurrent requests from bypassing the five-branch cap.
- Adds a small partial index for active-branch counting.
- Removes the redundant membership SELECT policy.
- Combines agent commission SELECT access while preserving admin-only writes.
- Splits customer owner/admin write permissions from the employee/owner/admin read policy.
- Adds indexes matching the agent commission list and completed-sales dashboard count.

## Required staging tests before adoption

1. Apply the complete reconstructed migration history to a clean staging database.
2. Confirm a business can have five active branches but cannot create or reactivate a sixth.
3. Run two simultaneous branch-create/activation transactions when four active branches exist; only one should succeed.
4. Verify an owner can create, view, edit and delete customer records; an employee can read customers but cannot write them.
5. Verify an agent can read only their own commission rows and cannot insert/update/delete commissions.
6. Verify a platform administrator retains full commission management.
7. Run the Supabase Security and Performance Advisors and compare the policy warnings.
8. Run application-level owner, employee, agent and platform-admin regression tests.

Do not remove indexes based only on the advisor's unused-index findings. Do not change or apply Daraja-related migrations as part of this file.
