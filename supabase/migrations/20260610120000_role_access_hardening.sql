-- Role hardening: default deny, leadership admin rows, no company-wide "user" roster leak.
-- btw-instance-seed: BTW production user_access rows; new instances — run scripts/bootstrap_new_instance.sql after db push.

-- Leadership (Matthew, Trent, Brent) — full admin; never employee portal.
update public.user_access
set
  role = 'admin',
  display_name = case lower(trim(email))
    when 'matthew.zinni@btwglobal.com' then 'Matthew Zinni'
    when 'trent.wynne@btwglobal.com' then 'Trent Wynne'
    when 'brent.wynne@btwglobal.com' then 'Brent Wynne'
    else display_name
  end,
  linked_employee_id = null,
  supervisor_name = ''
where lower(trim(email)) in (
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com'
);

insert into public.user_access (email, display_name, role, supervisor_name, linked_employee_id)
select v.email, v.display_name, 'admin', '', null
from (
  values
    ('matthew.zinni@btwglobal.com', 'Matthew Zinni'),
    ('trent.wynne@btwglobal.com', 'Trent Wynne'),
    ('brent.wynne@btwglobal.com', 'Brent Wynne')
) as v(email, display_name)
where not exists (
  select 1 from public.user_access ua where lower(trim(ua.email)) = lower(trim(v.email))
);

create or replace function public.orbis_current_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  access_role text;
  profile_role text;
begin
  access_role := public.orbis_access_role();

  if access_role in ('admin', 'supervisor', 'employee') then
    return access_role;
  end if;

  profile_role := public.orbis_profile_role();

  if profile_role = 'admin' then
    return 'admin';
  end if;

  if profile_role = 'supervisor' then
    return 'supervisor';
  end if;

  -- Default deny: no implicit "user" role with company-wide access.
  return coalesce(nullif(access_role, ''), '');
end;
$$;

create or replace function public.orbis_employee_row_visible(e public.employees)
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
      and public.orbis_supervisor_sees_employee(e)
    )
    or (
      public.orbis_is_employee()
      and e.id::text = public.orbis_linked_employee_id()
    );
$$;

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

  if lower(trim(auth_email)) in (
    'matthew.zinni@btwglobal.com',
    'trent.wynne@btwglobal.com',
    'brent.wynne@btwglobal.com'
  ) then
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
