-- Fix: candidate-resumes storage policies used a bare orbis_is_admin() OR
-- orbis_is_supervisor() check with no tie back to the candidate row's department, unlike the
-- `candidates` table itself which is correctly scoped via orbis_candidate_row_visible(). Resume
-- objects are stored at "<candidate_id>/<timestamp>_<filename>" (src/services/candidateResume.ts
-- uploadCandidateResume), so a supervisor who knows or guesses another department's candidate
-- UUID could list/download/sign a URL for that candidate's resume even though the candidates
-- row itself is correctly invisible to them. This is a live gap -- resumes are actively used,
-- unlike candidate_offers/candidate_interviews. Scopes storage access the same way, by joining
-- the object's leading path segment back to the candidate row.

create or replace function public.orbis_candidate_resume_object_visible(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.candidates c
    where c.id::text = (storage.foldername(object_name))[1]
      and public.orbis_candidate_row_visible(c)
  );
$$;

grant execute on function public.orbis_candidate_resume_object_visible(text) to authenticated;

drop policy if exists orbis_candidate_resumes_storage_select on storage.objects;
create policy orbis_candidate_resumes_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_candidate_resume_object_visible(name)
  );

drop policy if exists orbis_candidate_resumes_storage_insert on storage.objects;
create policy orbis_candidate_resumes_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-resumes'
    and public.orbis_candidate_resume_object_visible(name)
  );

drop policy if exists orbis_candidate_resumes_storage_update on storage.objects;
create policy orbis_candidate_resumes_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_candidate_resume_object_visible(name)
  )
  with check (
    bucket_id = 'candidate-resumes'
    and public.orbis_candidate_resume_object_visible(name)
  );

drop policy if exists orbis_candidate_resumes_storage_delete on storage.objects;
create policy orbis_candidate_resumes_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.orbis_is_admin()
  );
