-- Do not auto-provision employee portal access for Brent/Trent (admin owners).

create or replace function public.orbis_ensure_employee_portal_access()
returns public.user_access
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
  existing public.user_access;
  matched public.employees;
  display text;
begin
  auth_email := public.orbis_auth_email();
  if auth_email = '' then
    return null;
  end if;

  select ua.* into existing
  from public.user_access ua
  where lower(trim(ua.email)) = auth_email
  limit 1;

  if found then
    return existing;
  end if;

  select e.* into matched
  from public.employees e
  where (
      lower(trim(coalesce(e.work_email, ''))) = auth_email
      or lower(trim(coalesce(e.personal_email, ''))) = auth_email
      or lower(trim(coalesce(e.email, ''))) = auth_email
    )
    and e.id::text not in ('BTW1601', 'BTW1602')
  order by e.hire_date desc nulls last
  limit 1;

  if not found then
    return null;
  end if;

  display := trim(coalesce(matched.first_name, '') || ' ' || coalesce(matched.last_name, ''));

  insert into public.user_access (email, display_name, role, supervisor_name, linked_employee_id)
  values (
    auth_email,
    nullif(display, ''),
    'employee',
    '',
    matched.id::text
  )
  returning * into existing;

  return existing;
end;
$$;

revoke all on function public.orbis_ensure_employee_portal_access() from public;
grant execute on function public.orbis_ensure_employee_portal_access() to authenticated;
