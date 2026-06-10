-- Supervisors may update employee roster records for their direct reports.

drop policy if exists orbis_employees_update_supervisor on public.employees;
create policy orbis_employees_update_supervisor
  on public.employees
  for update
  to authenticated
  using (
    public.orbis_is_supervisor()
    and public.orbis_supervisor_sees_employee(employees)
  )
  with check (
    public.orbis_is_supervisor()
    and public.orbis_supervisor_sees_employee(employees)
  );
