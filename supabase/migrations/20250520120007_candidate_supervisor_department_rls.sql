-- Candidates: admins see all; supervisors see candidates in departments they supervise.

create or replace function public.orbis_candidate_department_visible(dept text)
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
      and coalesce(trim(dept), '') <> ''
      and exists (
        select 1
        from public.employees e
        where public.orbis_supervisor_matches(
          coalesce(e.supervisor, ''),
          public.orbis_supervisor_scope_name()
        )
        and lower(trim(coalesce(e.department, ''))) = lower(trim(dept))
        and coalesce(trim(e.department), '') <> ''
      )
    );
$$;

create or replace function public.orbis_candidate_row_visible(c public.candidates)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_candidate_department_visible(c.department);
$$;

drop policy if exists orbis_candidates_admin on public.candidates;

drop policy if exists orbis_candidates_select on public.candidates;
create policy orbis_candidates_select
  on public.candidates
  for select
  to authenticated
  using (public.orbis_candidate_row_visible(candidates));

drop policy if exists orbis_candidates_insert on public.candidates;
create policy orbis_candidates_insert
  on public.candidates
  for insert
  to authenticated
  with check (public.orbis_candidate_department_visible(department));

drop policy if exists orbis_candidates_update on public.candidates;
create policy orbis_candidates_update
  on public.candidates
  for update
  to authenticated
  using (public.orbis_candidate_row_visible(candidates))
  with check (public.orbis_candidate_department_visible(department));

drop policy if exists orbis_candidates_delete on public.candidates;
create policy orbis_candidates_delete
  on public.candidates
  for delete
  to authenticated
  using (public.orbis_candidate_row_visible(candidates));

drop policy if exists orbis_candidate_notes_admin on public.candidate_notes;

drop policy if exists orbis_candidate_notes_select on public.candidate_notes;
create policy orbis_candidate_notes_select
  on public.candidate_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_notes_insert on public.candidate_notes;
create policy orbis_candidate_notes_insert
  on public.candidate_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_notes_update on public.candidate_notes;
create policy orbis_candidate_notes_update
  on public.candidate_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  )
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_notes_delete on public.candidate_notes;
create policy orbis_candidate_notes_delete
  on public.candidate_notes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

grant execute on function public.orbis_candidate_department_visible(text) to authenticated;
grant execute on function public.orbis_candidate_row_visible(public.candidates) to authenticated;
