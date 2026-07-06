-- Terminated roster employees lose Orbis access: revoke user_access and block RLS at the gate.

-- ---------------------------------------------------------------------------
-- Revoke matching user_access rows (linked id + roster work/personal emails)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_revoke_portal_access_for_employee_internal(p_employee_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees;
  revoked_count integer;
begin
  select e.* into emp
  from public.employees e
  where e.id::text = nullif(btrim(p_employee_id), '');

  if not found then
    return 0;
  end if;

  update public.user_access ua
  set
    approval_status = 'rejected',
    linked_employee_id = null
  where
    ua.linked_employee_id = emp.id::text
    or (
      coalesce(btrim(emp.work_email), '') <> ''
      and lower(trim(ua.email)) = lower(trim(emp.work_email))
    )
    or (
      coalesce(btrim(emp.personal_email), '') <> ''
      and lower(trim(ua.email)) = lower(trim(emp.personal_email))
    );

  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

create or replace function public.orbis_revoke_portal_access_for_employee(p_employee_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.orbis_is_admin() then
    raise exception 'Not authorized';
  end if;

  return public.orbis_revoke_portal_access_for_employee_internal(p_employee_id);
end;
$$;

revoke all on function public.orbis_revoke_portal_access_for_employee_internal(text) from public;
revoke all on function public.orbis_revoke_portal_access_for_employee(text) from public;
grant execute on function public.orbis_revoke_portal_access_for_employee(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Block approved users tied to a terminated roster identity (defense in depth)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_auth_user_terminated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with auth as (
    select public.orbis_auth_email() as email
  ),
  access as (
    select ua.linked_employee_id
    from public.user_access ua
    cross join auth
    where lower(trim(ua.email)) = auth.email
      and ua.approval_status = 'approved'
    limit 1
  )
  select exists (
    select 1
    from access a
    cross join auth
    where
      exists (
        select 1
        from public.employees e
        where e.id::text = nullif(btrim(a.linked_employee_id), '')
          and upper(trim(coalesce(e.status, ''))) = 'TERMINATED'
      )
      or (
        not exists (
          select 1
          from public.employees e_active
          where upper(trim(coalesce(e_active.status, ''))) = 'ACTIVE'
            and (
              e_active.id::text = nullif(btrim(a.linked_employee_id), '')
              or lower(trim(coalesce(e_active.work_email, ''))) = auth.email
              or lower(trim(coalesce(e_active.personal_email, ''))) = auth.email
            )
        )
        and exists (
          select 1
          from public.employees e_term
          where upper(trim(coalesce(e_term.status, ''))) = 'TERMINATED'
            and (
              e_term.id::text = nullif(btrim(a.linked_employee_id), '')
              or lower(trim(coalesce(e_term.work_email, ''))) = auth.email
              or lower(trim(coalesce(e_term.personal_email, ''))) = auth.email
            )
        )
      )
  );
$$;

grant execute on function public.orbis_auth_user_terminated() to authenticated;

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
  )
  and not public.orbis_auth_user_terminated();
$$;

-- ---------------------------------------------------------------------------
-- Auto-revoke on status → TERMINATED
-- ---------------------------------------------------------------------------

create or replace function public.orbis_trg_revoke_access_on_termination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(trim(coalesce(NEW.status, ''))) = 'TERMINATED'
     and upper(trim(coalesce(OLD.status, ''))) <> 'TERMINATED'
  then
    perform public.orbis_revoke_portal_access_for_employee_internal(NEW.id::text);
  end if;

  return NEW;
end;
$$;

drop trigger if exists orbis_revoke_access_on_termination on public.employees;
create trigger orbis_revoke_access_on_termination
  after update of status on public.employees
  for each row
  execute function public.orbis_trg_revoke_access_on_termination();

-- Do not auto-link personal portal logins to terminated roster rows.
create or replace function public.orbis_link_my_employee_record()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
  access_row public.user_access;
  matched public.employees;
  linked text;
  normalized_role text;
begin
  if not public.orbis_access_is_approved() then
    return null;
  end if;

  auth_email := public.orbis_auth_email();
  if auth_email = '' then
    return null;
  end if;

  select ua.* into access_row
  from public.user_access ua
  where lower(trim(ua.email)) = auth_email
  limit 1;

  if not found then
    return null;
  end if;

  normalized_role := case
    when lower(trim(coalesce(access_row.role, ''))) = 'employee' then 'user'
    else lower(trim(coalesce(access_row.role, '')))
  end;

  if normalized_role not in ('user', 'supervisor', 'admin') then
    return null;
  end if;

  linked := nullif(btrim(access_row.linked_employee_id), '');
  if linked is not null then
    if exists (
      select 1
      from public.employees e
      where e.id::text = linked
        and upper(trim(coalesce(e.status, ''))) = 'TERMINATED'
    ) then
      return null;
    end if;

    return linked;
  end if;

  select e.* into matched
  from public.employees e
  where (
      lower(trim(coalesce(e.work_email, ''))) = auth_email
      or lower(trim(coalesce(e.personal_email, ''))) = auth_email
    )
    and upper(trim(coalesce(e.status, ''))) = 'ACTIVE'
  order by e.hire_date desc nulls last
  limit 1;

  if not found then
    return null;
  end if;

  update public.user_access ua
  set linked_employee_id = matched.id::text
  where lower(trim(ua.email)) = auth_email
    and (ua.linked_employee_id is null or btrim(ua.linked_employee_id) = '');

  return matched.id::text;
end;
$$;
