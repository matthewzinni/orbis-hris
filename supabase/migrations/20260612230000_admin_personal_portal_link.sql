-- Allow admins with linked_employee_id to use personal portal tasks (handbook, onboarding).
-- Auto-link when login email matches roster work/personal email.

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
    return linked;
  end if;

  select e.* into matched
  from public.employees e
  where lower(trim(coalesce(e.work_email, ''))) = auth_email
     or lower(trim(coalesce(e.personal_email, ''))) = auth_email
  order by
    case
      when upper(trim(coalesce(e.status, ''))) in ('TERMINATED', 'INACTIVE') then 1
      else 0
    end,
    e.hire_date desc nulls last
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

-- Matthew Zinni (admin) → BTW2509; work email for future auto-link.
update public.user_access
set linked_employee_id = 'BTW2509'
where lower(trim(email)) = 'matthew.zinni@btwglobal.com'
  and (linked_employee_id is null or btrim(linked_employee_id) = '');

update public.employees
set work_email = 'matthew.zinni@btwglobal.com'
where id = 'BTW2509'
  and (work_email is null or btrim(work_email) = '');
