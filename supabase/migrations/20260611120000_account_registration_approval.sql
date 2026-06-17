-- Self-registration with admin approval (replaces magic-link employee portal provisioning).
-- btw-instance-config: leadership emails excluded from employee portal in RPCs below.

alter table public.user_access
  add column if not exists approval_status text;

update public.user_access
set approval_status = 'approved'
where approval_status is null;

alter table public.user_access
  alter column approval_status set default 'pending';

alter table public.user_access
  alter column approval_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_access_approval_status_check'
  ) then
    alter table public.user_access
      add constraint user_access_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

comment on column public.user_access.approval_status is
  'pending = awaiting admin; approved = can sign in; rejected = denied';

-- ---------------------------------------------------------------------------
-- Role helpers: user = PTO portal (legacy employee alias); must be approved
-- ---------------------------------------------------------------------------

create or replace function public.orbis_access_is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_access ua
    where lower(trim(ua.email)) = public.orbis_auth_email()
      and ua.approval_status = 'approved'
  );
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
  if public.orbis_auth_email() = '' then
    return '';
  end if;

  if not public.orbis_access_is_approved() then
    return '';
  end if;

  access_role := public.orbis_access_role();

  if access_role in ('admin', 'supervisor', 'user', 'employee') then
    return case when access_role = 'employee' then 'user' else access_role end;
  end if;

  profile_role := public.orbis_profile_role();

  if profile_role = 'admin' then
    return 'admin';
  end if;

  if profile_role = 'supervisor' then
    return 'supervisor';
  end if;

  return coalesce(nullif(access_role, ''), '');
end;
$$;

create or replace function public.orbis_is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_current_role() in ('user', 'employee');
$$;

create or replace function public.orbis_is_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_employee();
$$;

-- ---------------------------------------------------------------------------
-- Self-registration (authenticated, after signUp)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_register_account_request(p_display_name text default null)
returns public.user_access
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
  existing public.user_access;
  display text;
  matched public.employees;
begin
  auth_email := public.orbis_auth_email();
  if auth_email = '' then
    raise exception 'Not signed in';
  end if;

  if auth_email in (
    'matthew.zinni@btwglobal.com',
    'trent.wynne@btwglobal.com',
    'brent.wynne@btwglobal.com'
  ) then
    raise exception 'This email is managed by HR. Use password sign-in.';
  end if;

  select ua.* into existing
  from public.user_access ua
  where lower(trim(ua.email)) = auth_email
  limit 1;

  if found then
    if existing.approval_status = 'approved' then
      raise exception 'An approved account already exists for this email.';
    end if;
    if existing.approval_status = 'rejected' then
      raise exception 'This account request was rejected. Contact HR.';
    end if;
    return existing;
  end if;

  display := nullif(trim(coalesce(p_display_name, '')), '');

  select e.* into matched
  from public.employees e
  where lower(trim(coalesce(e.work_email, ''))) = auth_email
     or lower(trim(coalesce(e.personal_email, ''))) = auth_email
  order by e.hire_date desc nulls last
  limit 1;

  insert into public.user_access (
    email,
    display_name,
    role,
    supervisor_name,
    linked_employee_id,
    approval_status,
    can_delete
  )
  values (
    auth_email,
    coalesce(display, nullif(trim(coalesce(matched.first_name, '') || ' ' || coalesce(matched.last_name, '')), '')),
    'user',
    '',
    case when matched.id is not null then matched.id::text else null end,
    'pending',
    false
  )
  returning * into existing;

  return existing;
end;
$$;

revoke all on function public.orbis_register_account_request(text) from public;
grant execute on function public.orbis_register_account_request(text) to authenticated;

grant execute on function public.orbis_access_is_approved() to authenticated;
grant execute on function public.orbis_is_user() to authenticated;

-- Disable auto employee portal provisioning on login (admin approves instead).
create or replace function public.orbis_ensure_employee_portal_access()
returns public.user_access
language plpgsql
security definer
set search_path = public
as $$
begin
  return null;
end;
$$;
