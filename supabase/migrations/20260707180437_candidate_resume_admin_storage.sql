-- Ensure admins and supervisors can read candidate resume folders in storage.
-- Filename matches the version recorded in production migration history.

create or replace function public.orbis_can_access_candidate_resume_storage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin() or public.orbis_is_supervisor();
$$;

grant execute on function public.orbis_can_access_candidate_resume_storage() to authenticated;

drop policy if exists orbis_candidate_resumes_storage_select on storage.objects;
create policy orbis_candidate_resumes_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_can_access_candidate_resume_storage()
  );

drop policy if exists orbis_candidate_resumes_storage_insert on storage.objects;
create policy orbis_candidate_resumes_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-resumes'
    and public.orbis_can_access_candidate_resume_storage()
  );

drop policy if exists orbis_candidate_resumes_storage_update on storage.objects;
create policy orbis_candidate_resumes_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_can_access_candidate_resume_storage()
  )
  with check (
    bucket_id = 'candidate-resumes'
    and public.orbis_can_access_candidate_resume_storage()
  );

drop policy if exists orbis_candidate_resumes_storage_delete on storage.objects;
create policy orbis_candidate_resumes_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_is_admin()
  );
