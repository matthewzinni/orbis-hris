-- Keep supervisor supervised_employee_ids in sync with roster supervisor field when an explicit list exists.

-- Case-insensitive supervisor name match (mixed-case scope_name must match roster text).
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
    and lower(trim(scope_name)) <> 'all'
    and (
      lower(trim(employee_supervisor)) like '%' || lower(trim(scope_name)) || '%'
      or lower(trim(scope_name)) like '%' || lower(trim(employee_supervisor)) || '%'
      or regexp_replace(lower(trim(employee_supervisor)), '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(lower(trim(scope_name)), '[^a-z0-9]', '', 'g') || '%'
      or regexp_replace(lower(trim(scope_name)), '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(lower(trim(employee_supervisor)), '[^a-z0-9]', '', 'g') || '%'
    );
$$;

create or replace function public.orbis_sync_my_supervisor_scope()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  access_row public.user_access;
  scope_name text;
  roster_ids text[];
  current_ids text[];
begin
  if not public.orbis_access_is_approved() or not public.orbis_is_supervisor() then
    return null;
  end if;

  select ua.* into access_row
  from public.user_access ua
  where lower(trim(ua.email)) = public.orbis_auth_email()
  limit 1;

  if not found then
    return null;
  end if;

  scope_name := nullif(btrim(access_row.supervisor_name), '');
  if scope_name is null then
    return access_row.supervised_employee_ids;
  end if;

  current_ids := coalesce(access_row.supervised_employee_ids, array[]::text[]);

  -- Empty explicit list: legacy fuzzy match on login; nothing to sync.
  if coalesce(cardinality(current_ids), 0) = 0 then
    return current_ids;
  end if;

  select coalesce(array_agg(e.id::text order by e.last_name nulls last, e.first_name nulls last, e.id), array[]::text[])
  into roster_ids
  from public.employees e
  where upper(trim(coalesce(e.status, ''))) not in ('TERMINATED', 'INACTIVE')
    and public.orbis_supervisor_matches(coalesce(e.supervisor, ''), scope_name);

  if roster_ids = current_ids then
    return current_ids;
  end if;

  update public.user_access ua
  set supervised_employee_ids = roster_ids
  where lower(trim(ua.email)) = public.orbis_auth_email();

  return roster_ids;
end;
$$;

revoke all on function public.orbis_sync_my_supervisor_scope() from public;
grant execute on function public.orbis_sync_my_supervisor_scope() to authenticated;

-- Kyle Hodges: drop stale partial allowlist (was only Ryan); use supervisor-name match for full team.
update public.user_access
set supervised_employee_ids = null
where lower(trim(email)) = 'kyle.hodges@btwglobal.com'
  and role = 'supervisor';
