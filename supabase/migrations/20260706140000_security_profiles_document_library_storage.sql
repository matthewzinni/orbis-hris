-- Phase 1 security hardening:
-- 1. Block self-service profiles.hr_role escalation
-- 2. Enable RLS on document_library
-- 3. Private HR storage buckets with scoped policies

-- ---------------------------------------------------------------------------
-- 1.1 profiles — prevent non-admins from changing hr_role
-- ---------------------------------------------------------------------------

create or replace function public.orbis_profiles_guard_hr_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hr_role is distinct from old.hr_role
     and not public.orbis_is_admin() then
    raise exception 'Only administrators may change hr_role';
  end if;

  return new;
end;
$$;

drop trigger if exists orbis_profiles_guard_hr_role on public.profiles;
create trigger orbis_profiles_guard_hr_role
  before update on public.profiles
  for each row
  execute function public.orbis_profiles_guard_hr_role();

-- ---------------------------------------------------------------------------
-- 1.2 document_library — RLS (admin write; approved users read active docs)
-- ---------------------------------------------------------------------------

alter table public.document_library enable row level security;

drop policy if exists orbis_document_library_select on public.document_library;
create policy orbis_document_library_select
  on public.document_library
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_access_is_approved()
      and coalesce(is_active, true) = true
    )
  );

drop policy if exists orbis_document_library_insert on public.document_library;
create policy orbis_document_library_insert
  on public.document_library
  for insert
  to authenticated
  with check (public.orbis_is_admin());

drop policy if exists orbis_document_library_update on public.document_library;
create policy orbis_document_library_update
  on public.document_library
  for update
  to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_document_library_delete on public.document_library;
create policy orbis_document_library_delete
  on public.document_library
  for delete
  to authenticated
  using (public.orbis_is_admin());

grant select, insert, update, delete on public.document_library to authenticated;

-- ---------------------------------------------------------------------------
-- 1.3 Storage helpers + buckets (documents, document-library, employee-documents)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_storage_path_employee_key(object_path text)
returns text
language sql
immutable
as $$
  select coalesce((storage.foldername(object_path))[1], '');
$$;

create or replace function public.orbis_employee_document_storage_accessible(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(btrim(public.orbis_storage_path_employee_key(object_path)), '') is not null
    and public.orbis_employee_child_accessible(
      public.orbis_storage_path_employee_key(object_path)
    );
$$;

create or replace function public.orbis_can_read_company_documents_storage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin() or public.orbis_access_is_approved();
$$;

grant execute on function public.orbis_storage_path_employee_key(text) to authenticated;
grant execute on function public.orbis_employee_document_storage_accessible(text) to authenticated;
grant execute on function public.orbis_can_read_company_documents_storage() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents',
    'documents',
    false,
    26214400,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png'
    ]
  ),
  (
    'document-library',
    'document-library',
    false,
    26214400,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png'
    ]
  ),
  (
    'employee-documents',
    'employee-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Company document buckets (handbook / policy library)
drop policy if exists orbis_documents_storage_select on storage.objects;
create policy orbis_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and public.orbis_can_read_company_documents_storage()
  );

drop policy if exists orbis_documents_storage_insert on storage.objects;
create policy orbis_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.orbis_is_admin()
  );

drop policy if exists orbis_documents_storage_update on storage.objects;
create policy orbis_documents_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and public.orbis_is_admin()
  )
  with check (
    bucket_id = 'documents'
    and public.orbis_is_admin()
  );

drop policy if exists orbis_documents_storage_delete on storage.objects;
create policy orbis_documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.orbis_is_admin()
  );

drop policy if exists orbis_document_library_storage_select on storage.objects;
create policy orbis_document_library_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'document-library'
    and public.orbis_can_read_company_documents_storage()
  );

drop policy if exists orbis_document_library_storage_insert on storage.objects;
create policy orbis_document_library_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'document-library'
    and public.orbis_is_admin()
  );

drop policy if exists orbis_document_library_storage_update on storage.objects;
create policy orbis_document_library_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'document-library'
    and public.orbis_is_admin()
  )
  with check (
    bucket_id = 'document-library'
    and public.orbis_is_admin()
  );

drop policy if exists orbis_document_library_storage_delete on storage.objects;
create policy orbis_document_library_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'document-library'
    and public.orbis_is_admin()
  );

-- Per-employee document bucket (paths: {employee_id}/filename)
drop policy if exists orbis_employee_documents_storage_select on storage.objects;
create policy orbis_employee_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and public.orbis_employee_document_storage_accessible(name)
  );

drop policy if exists orbis_employee_documents_storage_insert on storage.objects;
create policy orbis_employee_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and public.orbis_employee_document_storage_accessible(name)
  );

drop policy if exists orbis_employee_documents_storage_update on storage.objects;
create policy orbis_employee_documents_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'employee-documents'
    and public.orbis_employee_document_storage_accessible(name)
  )
  with check (
    bucket_id = 'employee-documents'
    and public.orbis_employee_document_storage_accessible(name)
  );

drop policy if exists orbis_employee_documents_storage_delete on storage.objects;
create policy orbis_employee_documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.orbis_is_admin()
      or public.orbis_employee_document_storage_accessible(name)
    )
  );
