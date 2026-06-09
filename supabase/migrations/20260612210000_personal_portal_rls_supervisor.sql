-- Supervisors with linked_employee_id use the same personal portal RLS as employees.

create or replace function public.orbis_has_personal_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(btrim(public.orbis_linked_employee_id()), '') is not null
    and (public.orbis_is_employee() or public.orbis_is_supervisor());
$$;

create or replace function public.orbis_personal_portal_owns(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_has_personal_portal()
    and emp_key = public.orbis_linked_employee_id();
$$;

grant execute on function public.orbis_has_personal_portal() to authenticated;
grant execute on function public.orbis_personal_portal_owns(text) to authenticated;

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
      public.orbis_is_supervisor()
      and e.id::text = public.orbis_linked_employee_id()
    )
    or (
      public.orbis_is_employee()
      and e.id::text = public.orbis_linked_employee_id()
    );
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
          public.orbis_is_supervisor()
          and e.id::text = public.orbis_linked_employee_id()
        )
        or (
          public.orbis_is_employee()
          and e.id::text = public.orbis_linked_employee_id()
        )
      )
  );
$$;

create or replace function public.orbis_update_my_profile(
  p_personal_email text default null,
  p_phone text default null
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id text;
  updated public.employees;
begin
  if not public.orbis_access_is_approved() then
    raise exception 'Access not approved';
  end if;

  if not public.orbis_has_personal_portal() then
    raise exception 'Not authorized';
  end if;

  linked_id := public.orbis_linked_employee_id();
  if linked_id is null or btrim(linked_id) = '' then
    raise exception 'No linked employee record';
  end if;

  update public.employees e
  set
    personal_email = case
      when p_personal_email is not null then nullif(btrim(p_personal_email), '')
      else e.personal_email
    end,
    phone = case
      when p_phone is not null then nullif(btrim(p_phone), '')
      else e.phone
    end
  where e.id::text = linked_id
  returning e.* into updated;

  if not found then
    raise exception 'Employee record not found';
  end if;

  return updated;
end;
$$;

drop policy if exists orbis_employee_acknowledgments_select on public.employee_acknowledgments;
create policy orbis_employee_acknowledgments_select
  on public.employee_acknowledgments
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or public.orbis_personal_portal_owns(employee_id)
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  );

drop policy if exists orbis_employee_acknowledgments_insert on public.employee_acknowledgments;
create policy orbis_employee_acknowledgments_insert
  on public.employee_acknowledgments
  for insert
  to authenticated
  with check (
    public.orbis_is_admin()
    or public.orbis_personal_portal_owns(employee_id)
  );
