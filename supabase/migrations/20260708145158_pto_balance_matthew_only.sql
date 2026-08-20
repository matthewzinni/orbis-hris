-- Only Matthew may manually change banked PTO baseline fields on employees.
-- Filename matches the version recorded in production migration history.

create or replace function public.orbis_can_adjust_pto_balance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and lower(trim(public.orbis_auth_email())) = 'matthew.zinni@btwglobal.com';
$$;

grant execute on function public.orbis_can_adjust_pto_balance() to authenticated;

create or replace function public.orbis_guard_pto_balance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.pto_balance_hours is distinct from OLD.pto_balance_hours
     or NEW.pto_balance_as_of is distinct from OLD.pto_balance_as_of
  then
    if not public.orbis_can_adjust_pto_balance() then
      raise exception 'Only Matthew can adjust banked PTO hours';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists orbis_guard_pto_balance_update on public.employees;
create trigger orbis_guard_pto_balance_update
  before update on public.employees
  for each row
  execute function public.orbis_guard_pto_balance_update();
