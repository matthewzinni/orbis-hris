-- Optional explicit roster for supervisors: supervised_employee_ids on user_access.
-- When non-empty, supervisors may only see/edit those employees (and related child rows).
-- When NULL or {}, legacy fuzzy match on employees.supervisor vs user_access.supervisor_name applies.
--
-- Uses text[] (not uuid[]) because employees.id may be text or uuid in different deployments.

do $$
declare
  col_udt text;
begin
  select c.udt_name
    into col_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'user_access'
    and c.column_name = 'supervised_employee_ids';

  if col_udt is null then
    alter table public.user_access add column supervised_employee_ids text[];
  elsif col_udt = '_uuid' then
    alter table public.user_access
      alter column supervised_employee_ids type text[]
      using (
        case
          when supervised_employee_ids is null then null
          else array(select x::text from unnest(supervised_employee_ids) as x)
        end
      );
  end if;
end $$;

-- Failed pushes may have created these with uuid[] — return type cannot change with OR REPLACE.
drop function if exists public.orbis_supervisor_sees_employee(public.employees);
drop function if exists public.orbis_supervisor_scoped_employee_ids();

comment on column public.user_access.supervised_employee_ids is
  'When set (non-empty), this supervisor is limited to these employees.id values (as text); ignores supervisor-name fuzzy match for roster/RLS.';

-- IDs listed for the signed-in supervisor (NULL = legacy supervisor field matching only)
create or replace function public.orbis_supervisor_scoped_employee_ids()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select ua.supervised_employee_ids
  from public.user_access ua
  where lower(trim(ua.email)) = public.orbis_auth_email()
  limit 1;
$$;

-- Single place for “does this supervisor user see employee row e?”
create or replace function public.orbis_supervisor_sees_employee(e public.employees)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      coalesce(cardinality(public.orbis_supervisor_scoped_employee_ids()), 0) > 0
      and e.id::text = any (public.orbis_supervisor_scoped_employee_ids())
    )
    or (
      coalesce(cardinality(public.orbis_supervisor_scoped_employee_ids()), 0) = 0
      and public.orbis_supervisor_matches(
        coalesce(e.supervisor, ''),
        public.orbis_supervisor_scope_name()
      )
    );
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
      )
  );
$$;

create or replace function public.orbis_supervisor_departments()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(trim(coalesce(e.department, '')))
  from public.employees e
  where public.orbis_is_supervisor()
    and trim(coalesce(e.department, '')) <> ''
    and public.orbis_supervisor_sees_employee(e);
$$;

create or replace function public.orbis_candidate_department_visible(dept text)
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
      and coalesce(trim(dept), '') <> ''
      and exists (
        select 1
        from public.employees e
        where public.orbis_supervisor_sees_employee(e)
          and lower(trim(coalesce(e.department, ''))) = lower(trim(dept))
          and coalesce(trim(e.department), '') <> ''
      )
    );
$$;

grant execute on function public.orbis_supervisor_scoped_employee_ids() to authenticated;
grant execute on function public.orbis_supervisor_sees_employee(public.employees) to authenticated;
