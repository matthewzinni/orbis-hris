-- Fix: the employee self-cancel policy's USING clause did not require the request to still
-- be 'requested' (contradicting the policy's own stated intent: "cancel their own PENDING
-- leave requests"), and its WITH CHECK only constrained the new status value. Nothing
-- stopped an employee from PATCHing other columns (hours, notes, approved_by, etc.) on any
-- of their own rows -- including an already-approved request -- while nominally "cancelling"
-- it. No current UI path lets an employee cancel their own request (the only cancel button
-- in the app is admin-only, in src/modules/leaveRequests.ts), so this closes pure unused
-- attack surface with no legitimate behavior change, while preserving the self-service
-- capability the original policy was named for.

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
      and status = 'requested'
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

-- Belt-and-suspenders: even with the USING/WITH CHECK tightened above, RLS alone cannot
-- compare OLD vs NEW column-by-column. This trigger blocks a self-service employee update
-- from touching any column other than status/updated_at, so a cancel can never also smuggle
-- in changes to hours, notes, approved_by, etc. Admin and supervisor updates are untouched.
create or replace function public.orbis_guard_leave_request_employee_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.orbis_is_admin() or public.orbis_is_supervisor() then
    return new;
  end if;

  if public.orbis_is_employee() and old.employee_id::text = public.orbis_linked_employee_id() then
    if new.employee_id is distinct from old.employee_id
      or new.leave_type is distinct from old.leave_type
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.hours is distinct from old.hours
      or new.intermittent is distinct from old.intermittent
      or new.notes is distinct from old.notes
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.payroll_notified is distinct from old.payroll_notified
      or new.created_by is distinct from old.created_by
      or new.deduct_from_pto_balance is distinct from old.deduct_from_pto_balance
    then
      raise exception 'Employees may only cancel their own leave request, not edit its fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orbis_guard_leave_request_employee_cancel on public.leave_requests;
create trigger orbis_guard_leave_request_employee_cancel
  before update on public.leave_requests
  for each row execute function public.orbis_guard_leave_request_employee_cancel();
