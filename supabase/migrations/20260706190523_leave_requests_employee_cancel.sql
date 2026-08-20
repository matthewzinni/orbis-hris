-- Allow employees to cancel their own pending leave requests.
-- Filename matches the version recorded in production migration history.

drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests
  for update to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
    or (
      public.orbis_is_employee()
      and employee_id::text = public.orbis_linked_employee_id()
    )
  )
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
    or (
      public.orbis_is_employee()
      and employee_id::text = public.orbis_linked_employee_id()
      and status = 'cancelled'
    )
  );
