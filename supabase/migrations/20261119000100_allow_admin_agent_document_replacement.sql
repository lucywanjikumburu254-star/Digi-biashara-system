-- Allow authenticated platform admins to replace agent application documents.
-- The existing admin SELECT policy and applicant INSERT policy remain unchanged.
create policy "platform admins update agent application images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'agent-application-documents'
  and private.is_platform_admin()
)
with check (
  bucket_id = 'agent-application-documents'
  and private.is_platform_admin()
);
