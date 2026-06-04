-- Resumes for hiring pipeline (stored path saved on candidates.resume_url)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-resumes',
  'candidate-resumes',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;

drop policy if exists orbis_candidate_resumes_storage_select on storage.objects;
create policy orbis_candidate_resumes_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and (public.orbis_is_admin() or public.orbis_is_supervisor())
  );

drop policy if exists orbis_candidate_resumes_storage_insert on storage.objects;
create policy orbis_candidate_resumes_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-resumes'
    and (public.orbis_is_admin() or public.orbis_is_supervisor())
  );

drop policy if exists orbis_candidate_resumes_storage_update on storage.objects;
create policy orbis_candidate_resumes_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and (public.orbis_is_admin() or public.orbis_is_supervisor())
  )
  with check (
    bucket_id = 'candidate-resumes'
    and (public.orbis_is_admin() or public.orbis_is_supervisor())
  );

drop policy if exists orbis_candidate_resumes_storage_delete on storage.objects;
create policy orbis_candidate_resumes_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_is_admin()
  );
