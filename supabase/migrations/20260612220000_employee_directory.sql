-- Company directory for employee portal (name, title, department, supervisor — no HR metadata).

create or replace function public.orbis_list_employee_directory()
returns table (
  id text,
  first_name text,
  last_name text,
  department text,
  "position" text,
  supervisor text,
  is_remote boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id::text,
    e.first_name,
    e.last_name,
    e.department,
    e.position,
    e.supervisor,
    coalesce(e.is_remote, false)
  from public.employees e
  where public.orbis_access_is_approved()
    and upper(trim(coalesce(e.status, ''))) = 'ACTIVE'
  order by
    nullif(btrim(e.department), '') nulls last,
    e.last_name nulls last,
    e.first_name nulls last,
    e.id;
$$;

revoke all on function public.orbis_list_employee_directory() from public;
grant execute on function public.orbis_list_employee_directory() to authenticated;
