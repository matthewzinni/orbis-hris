-- HR notes (employee_notes) are for admins and supervisors only — not employee self-service.

create or replace function public.orbis_hr_staff_child_accessible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.id::text = emp_key
      and (
        public.orbis_is_admin()
        or (
          public.orbis_is_supervisor()
          and public.orbis_supervisor_sees_employee(e)
        )
      )
  );
$$;

grant execute on function public.orbis_hr_staff_child_accessible(text) to authenticated;

drop policy if exists orbis_employee_notes_select on public.employee_notes;
create policy orbis_employee_notes_select
  on public.employee_notes
  for select
  to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_employee_notes_insert on public.employee_notes;
create policy orbis_employee_notes_insert
  on public.employee_notes
  for insert
  to authenticated
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_employee_notes_update on public.employee_notes;
create policy orbis_employee_notes_update
  on public.employee_notes
  for update
  to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text))
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_employee_notes_delete on public.employee_notes;
create policy orbis_employee_notes_delete
  on public.employee_notes
  for delete
  to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));
