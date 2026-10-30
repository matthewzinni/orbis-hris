-- Fix: internal_job_interest UPDATE policy reused the SELECT-visibility predicate as its
-- WITH CHECK clause. That predicate includes an unrestricted "it's my own row" branch
-- (orbis_internal_job_interest_visible), so any employee could PATCH their own
-- internal_job_interest.status (e.g. to 'selected') directly via the Supabase client,
-- bypassing HR/supervisor review entirely. The app never gives employees an update path
-- to this table (they only insert via orbis_submit_internal_job_interest and select their
-- own rows), so this tightens the policy to staff-only with no legitimate behavior change.

create or replace function public.orbis_internal_job_interest_manageable(i public.internal_job_interest)
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
      and exists (
        select 1
        from public.internal_job_postings p
        where p.id = i.posting_id
        and (
          public.orbis_internal_job_hiring_manager_match(p.hiring_manager_name)
          or lower(trim(p.department)) in (select public.orbis_supervisor_departments())
        )
      )
    )
    or (
      public.orbis_is_supervisor()
      and exists (
        select 1
        from public.employees e
        where e.id::text = i.employee_id
        and public.orbis_supervisor_matches(
          coalesce(e.supervisor, ''),
          public.orbis_supervisor_scope_name()
        )
      )
    );
$$;

grant execute on function public.orbis_internal_job_interest_manageable(public.internal_job_interest) to authenticated;

drop policy if exists orbis_internal_job_interest_update on public.internal_job_interest;
create policy orbis_internal_job_interest_update
  on public.internal_job_interest for update to authenticated
  using (public.orbis_internal_job_interest_manageable(internal_job_interest))
  with check (public.orbis_internal_job_interest_manageable(internal_job_interest));
