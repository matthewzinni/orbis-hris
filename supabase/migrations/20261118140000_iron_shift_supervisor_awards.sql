-- Iron Shift Award replaces the Impact Player flag. Supervisors could flag their own
-- direct reports as Impact Players, so they can now give those reports an Iron Shift
-- Award. Admin access (orbis_can_access_care_engagement) is unchanged; this only adds
-- a narrow insert path for supervisors: iron_shift rows, own team, never themselves.

create or replace function public.orbis_can_give_iron_shift_award(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_supervisor()
    and coalesce(emp_key, '') <> ''
    and emp_key is distinct from public.orbis_linked_employee_id()
    and exists (
      select 1
      from public.employees e
      where e.id::text = emp_key
        and upper(trim(coalesce(e.status, ''))) not in ('TERMINATED', 'INACTIVE')
        and public.orbis_supervisor_sees_employee(e)
    );
$$;

revoke all on function public.orbis_can_give_iron_shift_award(text) from public;
grant execute on function public.orbis_can_give_iron_shift_award(text) to authenticated;

drop policy if exists orbis_care_recognition_supervisor_iron_shift_insert on public.care_recognition;
create policy orbis_care_recognition_supervisor_iron_shift_insert on public.care_recognition
  for insert to authenticated
  with check (
    recognition_type = 'iron_shift'
    and public.orbis_can_give_iron_shift_award(employee_id)
  );
