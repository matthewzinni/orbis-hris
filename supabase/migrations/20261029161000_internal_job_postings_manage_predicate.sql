-- Fix: internal_job_postings UPDATE policy reused the SELECT-visibility predicate
-- (orbis_internal_job_posting_visible) as its WITH CHECK clause. That predicate
-- intentionally includes an "any employee can see an open posting" branch for browsing,
-- which meant any employee could also update (edit title/pay/description, close, etc.)
-- any open posting directly via the Supabase client. The UI already gates editing via
-- canManageInternalJobPosting (admin, or supervisor matching the posting's department or
-- hiring manager) and never lets a plain employee call update() on this table, so this
-- migration adds a distinct manage predicate for UPDATE with no legitimate behavior change.

create or replace function public.orbis_internal_job_posting_manageable(p public.internal_job_postings)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and (
        lower(trim(p.department)) in (select public.orbis_supervisor_departments())
        or public.orbis_internal_job_hiring_manager_match(p.hiring_manager_name)
        or p.created_by = public.orbis_auth_uid()
      )
    );
$$;

grant execute on function public.orbis_internal_job_posting_manageable(public.internal_job_postings) to authenticated;

drop policy if exists orbis_internal_job_postings_update on public.internal_job_postings;
create policy orbis_internal_job_postings_update
  on public.internal_job_postings for update to authenticated
  using (public.orbis_internal_job_posting_manageable(internal_job_postings))
  with check (public.orbis_internal_job_posting_manageable(internal_job_postings));
