-- Storage bucket for operations issue attachments (apply bucket in Supabase dashboard if insert fails)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operations-issues',
  'operations-issues',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']
)
on conflict (id) do nothing;

drop policy if exists orbis_operations_issues_storage_select on storage.objects;
create policy orbis_operations_issues_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'operations-issues'
    and (
      public.orbis_is_admin()
      or public.orbis_is_supervisor()
    )
  );

drop policy if exists orbis_operations_issues_storage_insert on storage.objects;
create policy orbis_operations_issues_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'operations-issues'
    and (
      public.orbis_is_admin()
      or public.orbis_is_supervisor()
    )
  );

drop policy if exists orbis_operations_issues_storage_delete on storage.objects;
create policy orbis_operations_issues_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'operations-issues'
    and public.orbis_is_admin()
  );
