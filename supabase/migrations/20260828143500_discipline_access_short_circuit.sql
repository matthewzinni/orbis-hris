-- Avoid evaluating supervisor-scope helpers for HR users who already have
-- organization-wide discipline access. SQL boolean expressions are not
-- guaranteed to short-circuit, so use PL/pgSQL control flow explicitly.

create or replace function public.orbis_discipline_report_accessible(emp_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.orbis_has_org_wide_discipline_access() then
    return true;
  end if;

  if not (public.orbis_is_supervisor() or public.orbis_is_admin()) then
    return false;
  end if;

  return exists (
    select 1
    from public.employees e
    where e.id::text = emp_key
      and public.orbis_supervisor_sees_employee(e)
  );
end;
$$;

grant execute on function public.orbis_discipline_report_accessible(text) to authenticated;

comment on function public.orbis_discipline_report_accessible(text) is
  'Checks discipline row access with explicit HR short-circuiting before supervisor scope evaluation.';
