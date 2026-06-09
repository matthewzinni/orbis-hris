-- Link supervisors/users to their own employee record for personal portal (profile, tasks, PTO).
-- Backfill + self-service RPC when login email matches roster personal/work email.

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

  if case
    when lower(trim(coalesce(access_row.role, ''))) = 'employee' then 'user'
    else lower(trim(coalesce(access_row.role, '')))
  end not in ('user', 'supervisor') then
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

revoke all on function public.orbis_link_my_employee_record() from public;
grant execute on function public.orbis_link_my_employee_record() to authenticated;

-- Backfill existing approved user/supervisor rows (e.g. Gisselle Castro Vazquez → BTW2201).
update public.user_access ua
set linked_employee_id = e.id::text
from public.employees e
where (ua.linked_employee_id is null or btrim(ua.linked_employee_id) = '')
  and case
    when lower(trim(coalesce(ua.role, ''))) = 'employee' then 'user'
    else lower(trim(coalesce(ua.role, '')))
  end in ('user', 'supervisor')
  and (
    lower(trim(coalesce(e.personal_email, ''))) = lower(trim(ua.email))
    or lower(trim(coalesce(e.work_email, ''))) = lower(trim(ua.email))
  );
