-- Supervisors may update direct reports but not payroll, status, or termination fields.
-- Filename matches the version recorded in production migration history.

create or replace function public.orbis_guard_supervisor_employee_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.orbis_is_admin() or not public.orbis_is_supervisor() then
    return NEW;
  end if;

  if not public.orbis_supervisor_sees_employee(OLD) then
    raise exception 'Not authorized to update this employee';
  end if;

  if NEW.id is distinct from OLD.id then
    raise exception 'Supervisors cannot change employee id';
  end if;

  if NEW.status is distinct from OLD.status
     or NEW.termination_date is distinct from OLD.termination_date
     or NEW.termination_reason is distinct from OLD.termination_reason
     or NEW.pay_type is distinct from OLD.pay_type
     or NEW.standard_hours is distinct from OLD.standard_hours
     or NEW.benefits_status is distinct from OLD.benefits_status
     or NEW.hire_date is distinct from OLD.hire_date
     or NEW.pto_balance_hours is distinct from OLD.pto_balance_hours
     or NEW.pto_balance_as_of is distinct from OLD.pto_balance_as_of
     or NEW.work_email is distinct from OLD.work_email
     or NEW.is_remote is distinct from OLD.is_remote
     or NEW.rehire_eligible is distinct from OLD.rehire_eligible
  then
    raise exception 'Supervisors cannot modify payroll, status, or termination fields';
  end if;

  return NEW;
end;
$$;

drop trigger if exists orbis_guard_supervisor_employee_update on public.employees;
create trigger orbis_guard_supervisor_employee_update
  before update on public.employees
  for each row
  execute function public.orbis_guard_supervisor_employee_update();
