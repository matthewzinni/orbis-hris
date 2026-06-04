-- Employee self-service: view PTO balance and submit leave requests.
-- Approvals remain admin + direct supervisor only.

alter table public.user_access
  add column if not exists linked_employee_id text;

comment on column public.user_access.linked_employee_id is
  'For role=employee: employees.id this login may access (PTO + own leave requests).';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.orbis_linked_employee_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(ua.linked_employee_id), '')
  from public.user_access ua
  where lower(trim(ua.email)) = public.orbis_auth_email()
  limit 1;
$$;

create or replace function public.orbis_is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_current_role() = 'employee';
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

  if access_role in ('admin', 'supervisor', 'user', 'employee') then
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
    )
    or public.orbis_current_role() = 'user';
$$;

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
          and public.orbis_supervisor_sees_employee(e)
        )
        or (
          public.orbis_is_employee()
          and e.id::text = public.orbis_linked_employee_id()
        )
      )
  );
$$;

-- Link first-time sign-in to roster email (work/personal) without HR creating user_access rows.
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
  where lower(trim(coalesce(e.work_email, ''))) = auth_email
     or lower(trim(coalesce(e.personal_email, ''))) = auth_email
     or lower(trim(coalesce(e.email, ''))) = auth_email
  order by e.hire_date desc nulls last
  limit 1;

  if not found then
    return null;
  end if;

  display := trim(coalesce(matched.first_name, '') || ' ' || coalesce(matched.last_name, ''));

  insert into public.user_access (email, display_name, role, linked_employee_id)
  values (
    auth_email,
    nullif(display, ''),
    'employee',
    matched.id::text
  )
  returning * into existing;

  return existing;
end;
$$;

revoke all on function public.orbis_ensure_employee_portal_access() from public;
grant execute on function public.orbis_ensure_employee_portal_access() to authenticated;

grant execute on function public.orbis_linked_employee_id() to authenticated;
grant execute on function public.orbis_is_employee() to authenticated;

-- ---------------------------------------------------------------------------
-- leave_requests: employees may read/create own; approve stays admin/supervisor
-- ---------------------------------------------------------------------------

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

drop policy if exists leave_requests_insert on public.leave_requests;
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
    or (
      public.orbis_is_employee()
      and employee_id::text = public.orbis_linked_employee_id()
    )
  );

drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests
  for update to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
  )
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
  );
