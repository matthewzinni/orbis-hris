-- Migration: Orbis RLS helper functions (run before orbis_rls_policies)
-- Mirrors src/services/access.ts: admin = full access, supervisor = team by supervisor name match.

-- ---------------------------------------------------------------------------
-- Auth context
-- ---------------------------------------------------------------------------

create or replace function public.orbis_auth_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.orbis_auth_uid()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Role resolution (user_access first, then profiles.hr_role)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_access_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(ua.role, '')))
  from public.user_access ua
  where lower(trim(ua.email)) = public.orbis_auth_email()
  limit 1;
$$;

create or replace function public.orbis_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(p.hr_role, '')))
  from public.profiles p
  where p.id = public.orbis_auth_uid()
  limit 1;
$$;

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

  if access_role in ('admin', 'supervisor', 'user') then
    return access_role;
  end if;

  profile_role := public.orbis_profile_role();

  if profile_role = 'admin' then
    return 'admin';
  end if;

  if profile_role = 'supervisor' then
    return 'supervisor';
  end if;

  if profile_role = 'user' then
    return 'user';
  end if;

  return coalesce(nullif(access_role, ''), nullif(profile_role, ''), 'user');
end;
$$;

create or replace function public.orbis_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_current_role() = 'admin';
$$;

create or replace function public.orbis_is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_current_role() = 'supervisor';
$$;

create or replace function public.orbis_supervisor_scope_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(ua.supervisor_name, '')))
  from public.user_access ua
  where lower(trim(ua.email)) = public.orbis_auth_email()
  limit 1;
$$;

-- Same fuzzy match as employeeMatchesSupervisorAccess() in the app
create or replace function public.orbis_supervisor_matches(
  employee_supervisor text,
  scope_name text
)
returns boolean
language sql
immutable
as $$
  select
    coalesce(trim(employee_supervisor), '') <> ''
    and coalesce(trim(scope_name), '') <> ''
    and scope_name <> 'all'
    and (
      lower(trim(employee_supervisor)) like '%' || scope_name || '%'
      or scope_name like '%' || lower(trim(employee_supervisor)) || '%'
      or regexp_replace(lower(trim(employee_supervisor)), '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(scope_name, '[^a-z0-9]', '', 'g') || '%'
      or regexp_replace(scope_name, '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(lower(trim(employee_supervisor)), '[^a-z0-9]', '', 'g') || '%'
    );
$$;

-- ---------------------------------------------------------------------------
-- Employee visibility
-- ---------------------------------------------------------------------------

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
      and public.orbis_supervisor_matches(
        coalesce(e.supervisor, ''),
        public.orbis_supervisor_scope_name()
      )
    )
    or public.orbis_current_role() = 'user';
$$;

-- Child tables reference employees.id and/or employees.employee_id as text/uuid
-- Notes, discipline, stay interviews, etc. (not read-only "user" role)
create or replace function public.orbis_employee_child_accessible(emp_key text)
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
        and public.orbis_supervisor_matches(
          coalesce(e.supervisor, ''),
          public.orbis_supervisor_scope_name()
        )
      )
    )
  );
$$;

create or replace function public.orbis_employee_key_visible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_employee_child_accessible(emp_key);
$$;

create or replace function public.orbis_employee_key_visible_uuid(emp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_employee_key_visible(emp_id::text);
$$;

-- Performance reviews: admin always; supervisors only for direct reports
create or replace function public.orbis_performance_review_visible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_employee_child_accessible(emp_key);
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.orbis_auth_email() to authenticated;
grant execute on function public.orbis_auth_uid() to authenticated;
grant execute on function public.orbis_access_role() to authenticated;
grant execute on function public.orbis_profile_role() to authenticated;
grant execute on function public.orbis_current_role() to authenticated;
grant execute on function public.orbis_is_admin() to authenticated;
grant execute on function public.orbis_is_supervisor() to authenticated;
grant execute on function public.orbis_supervisor_scope_name() to authenticated;
grant execute on function public.orbis_supervisor_matches(text, text) to authenticated;
grant execute on function public.orbis_employee_row_visible(public.employees) to authenticated;
grant execute on function public.orbis_employee_child_accessible(text) to authenticated;
grant execute on function public.orbis_employee_key_visible(text) to authenticated;
grant execute on function public.orbis_employee_key_visible_uuid(uuid) to authenticated;
grant execute on function public.orbis_performance_review_visible(text) to authenticated;
